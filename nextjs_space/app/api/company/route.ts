export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser, getUserCompanyId, requireUserCompany } from '@/lib/auth-helpers';
import { companySchema, validateBody, describeValidationError } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { isAcceptableLogoValue } from '@/lib/logo';
import { type TxClient } from '@/lib/payment-calc';

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { data, error } = validateBody(companySchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const defaultCategories = [
      { name: 'Services', type: 'income', color: '#7C3AED' },
      { name: 'Products', type: 'income', color: '#2563EB' },
      { name: 'Consulting', type: 'income', color: '#059669' },
      { name: 'Other Income', type: 'income', color: '#6B7280' },
      { name: 'Office Supplies', type: 'expense', color: '#EF4444' },
      { name: 'Rent', type: 'expense', color: '#F59E0B' },
      { name: 'Utilities', type: 'expense', color: '#8B5CF6' },
      { name: 'Software', type: 'expense', color: '#3B82F6' },
      { name: 'Marketing', type: 'expense', color: '#EC4899' },
      { name: 'Travel', type: 'expense', color: '#14B8A6' },
      { name: 'Insurance', type: 'expense', color: '#F97316' },
      { name: 'Other Expense', type: 'expense', color: '#6B7280' },
    ];

    // The duplicate check, the company insert, the membership insert and the
    // default categories all run in one Serializable transaction. Previously the
    // check and the insert were separate statements, so two concurrent requests
    // could each pass the check and create a second, unreachable company.
    const result = await prisma.$transaction(
      async (tx: TxClient) => {
        /**
         * Double-submit guard.
         *
         * This used to refuse outright if the user belonged to any company at
         * all, which was both the concurrency guard and the reason a second
         * company could not exist. A user may now hold several, so the check
         * narrowed to what it was actually protecting against: the same
         * onboarding form submitted twice, which arrives twice with the same
         * name. Two deliberately different companies pass; a resubmitted one
         * does not.
         *
         * Serializable is what makes it a guard rather than a suggestion — two
         * concurrent identical submissions cannot both read "no match" and
         * both insert.
         */
        const duplicate = await tx.company.findFirst({
          where: { name: data.name, members: { some: { userId: user.id } } },
          select: { id: true },
        });
        if (duplicate) {
          return {
            kind: 'error' as const,
            status: 409,
            message: 'You already have a company with that name',
          };
        }

        const created = await tx.company.create({
          data: {
            name: data.name,
            country: data.country ?? 'US',
            defaultCurrency: data.defaultCurrency ?? 'USD',
            // These were accepted by the schema and written by PUT, but silently
            // dropped on create, so onboarding data was lost.
            timezone: data.timezone ?? undefined,
            locale: data.locale ?? undefined,
            businessType: data.businessType,
            address: data.address,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
            phone: data.phone,
            email: data.email || undefined,
            website: data.website,
            legalName: data.legalName,
            taxNumber: data.taxNumber,
            taxOffice: data.taxOffice,
            members: { create: { userId: user.id, role: 'owner' } },
          },
        });

        await tx.category.createMany({
          data: defaultCategories.map((c) => ({ ...c, companyId: created.id })),
        });

        return { kind: 'ok' as const, company: created };
      },
      { isolationLevel: 'Serializable' }
    );

    if (result.kind === 'error') {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    const company = result.company;

    return NextResponse.json(company);
  } catch (error) {
    return handleApiError('company:POST', error, { fallbackMessage: 'Failed to create company' });
  }
}

/**
 * The signed-in user's active company.
 *
 * Resolved through `getUserCompanyId`, not a `findFirst` of its own: this is
 * what the sidebar draws and what onboarding checks, so it has to name the same
 * company every API route is scoped to. Its own lookup returned an arbitrary
 * membership, which for a user with two companies meant the sidebar could show
 * one company's name above another company's data.
 *
 * The 200-with-null contract for a user who has no company is deliberate and
 * unchanged — the layout guard and the onboarding check both read it.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const companyId = await getUserCompanyId();
    if (!companyId) return NextResponse.json(null);

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    return NextResponse.json(company ?? null);
  } catch (error) {
    return handleApiError('company:GET', error, { fallbackMessage: 'Failed to fetch company' });
  }
}

export async function PUT(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const parsed = companySchema.safeParse(body);
    if (!parsed.success) {
      // Return the offending field and its message, not just "Validation failed".
      // The settings screen highlights the field and shows the message.
      const described = describeValidationError(parsed.error);
      console.error('[company:PUT] validation failed:', described.field, described.error);
      return NextResponse.json(described, { status: 400 });
    }
    const data = parsed.data;

    // A logo must be an object this company uploaded. The presigned upload
    // endpoint always writes to `.../uploads/{companyId}/...`, so requiring that
    // segment stops one company from pointing its logo at another company's
    // object, or at an arbitrary external URL.
    // A logo is either an image data URL produced in the browser, or — for
    // logos saved before the move off S3 — a key under this company's own
    // upload prefix. Anything else is refused: an arbitrary URL, an SVG (which
    // is a document and can carry script), or a data URL of another type.
    if (data.logoUrl) {
      if (!isAcceptableLogoValue(data.logoUrl, companyId)) {
        return NextResponse.json(
          {
            error: 'That logo could not be accepted. Upload a PNG, JPG, JPEG or WebP image.',
            field: 'logoUrl',
          },
          { status: 400 }
        );
      }
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        name: data.name,
        country: data.country,
        defaultCurrency: data.defaultCurrency,
        timezone: data.timezone,
        locale: data.locale,
        businessType: data.businessType,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        phone: data.phone,
        email: data.email || undefined,
        website: data.website,
        taxNumber: data.taxNumber,
        taxOffice: data.taxOffice,
        legalName: data.legalName,
        // Empty string clears the logo; undefined leaves the existing one alone.
        logoUrl: data.logoUrl === '' ? null : data.logoUrl,

        // Branding. These were added to the schema but never persisted, so a user
        // could fill them in, see "saved", and find the values gone on reload.
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        accentColor: data.accentColor,
        industry: data.industry,

        // Invoice settings.
        invoicePrefix: data.invoicePrefix,
        invoiceNextNumber: data.invoiceNextNumber,
        defaultPaymentTerms: data.defaultPaymentTerms,
        defaultTaxRate: data.defaultTaxRate,
        invoiceNotes: data.invoiceNotes,
        paymentInstructions: data.paymentInstructions,
        invoiceFooter: data.invoiceFooter,
        invoiceShowLogo: data.invoiceShowLogo,
        invoiceShowTax: data.invoiceShowTax,
        invoiceTemplate: data.invoiceTemplate,

        // Payment settings.
        defaultPaymentMethod: data.defaultPaymentMethod,
        bankTransferInstructions: data.bankTransferInstructions,
      },
    });
    return NextResponse.json(company);
  } catch (error) {
    return handleApiError('company:PUT', error, {
      fallbackMessage: 'Unable to save settings right now. Please try again.',
    });
  }
}
