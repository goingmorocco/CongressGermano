// Supabase Edge Function: send-confirmation
// Sends a "we received your application" email whenever a new row
// is inserted into the `registrations` table, via a Database Webhook.
//
// SETUP — see the accompanying instructions for full steps:
// 1. Create this function in Supabase Dashboard -> Edge Functions -> New function
//    named "send-confirmation", paste this code in.
// 2. Add a secret: Edge Functions -> send-confirmation -> Secrets ->
//      RESEND_API_KEY = <your Resend API key>
//    (optional) FROM_EMAIL = e.g. "Karriere Bruecke <no-reply@yourdomain.com>"
// 3. Database -> Webhooks -> Create a new webhook:
//      Table: registrations   Event: Insert
//      Type: Supabase Edge Functions -> select "send-confirmation"
//      (or HTTP Request to the function URL if your dashboard shows that option)

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Karriere Bruecke <onboarding@resend.dev>";

type Templates = {
  [lang: string]: {
    subject: string;
    body: (name: string, plan: string) => string;
  };
};

const templates: Templates = {
  fr: {
    subject: "Nous avons bien reçu votre candidature — Congrès Germano-Marocain 2026",
    body: (name, plan) => `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#16213A;">
        <h2 style="color:#0B2A5B;">Bonjour ${name},</h2>
        <p>Merci d'avoir soumis votre candidature pour le <strong>Congrès Germano-Marocain 2026</strong>${plan ? ` (formule <strong>${plan}</strong>)` : ""}.</p>
        <p>Votre candidature est <strong>en cours d'examen</strong>. Notre équipe reviendra vers vous très prochainement pour vous communiquer les prochaines étapes et organiser le paiement.</p>
        <p>Vous n'avez rien d'autre à faire pour l'instant.</p>
        <p style="margin-top:24px;">À bientôt,<br><strong>Karriere Bruecke International</strong></p>
      </div>
    `,
  },
  de: {
    subject: "Ihre Bewerbung ist eingegangen — Deutsch-Marokkanischer Kongress 2026",
    body: (name, plan) => `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#16213A;">
        <h2 style="color:#0B2A5B;">Hallo ${name},</h2>
        <p>Vielen Dank für Ihre Bewerbung zum <strong>Deutsch-Marokkanischen Kongress 2026</strong>${plan ? ` (Ticket <strong>${plan}</strong>)` : ""}.</p>
        <p>Ihre Bewerbung wird <strong>derzeit geprüft</strong>. Unser Team meldet sich in Kürze bei Ihnen mit den nächsten Schritten und den Zahlungsdetails.</p>
        <p>Sie müssen im Moment nichts weiter tun.</p>
        <p style="margin-top:24px;">Bis bald,<br><strong>Karriere Bruecke International</strong></p>
      </div>
    `,
  },
  ar: {
    subject: "توصلنا بطلبك — المؤتمر الألماني المغربي 2026",
    body: (name, plan) => `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#16213A;">
        <h2 style="color:#0B2A5B;">مرحبا ${name}،</h2>
        <p>شكرا على صيفطك طلب المشاركة ديالك فـ<strong>المؤتمر الألماني المغربي 2026</strong>${plan ? ` (باقة <strong>${plan}</strong>)` : ""}.</p>
        <p>الطلب ديالك <strong>دابا فطور المراجعة</strong>. الفريق ديالنا غايتواصل معاك قريبا بالخطوات الجاية وتفاصيل الأداء.</p>
        <p>ماخصكش دير حتى حاجة أخرى دابا.</p>
        <p style="margin-top:24px;">إلى قريب،<br><strong>Karriere Bruecke International</strong></p>
      </div>
    `,
  },
};

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    // Database Webhooks send { type, table, record, old_record }
    const record = payload.record || payload;

    if (!record || !record.email) {
      return new Response(JSON.stringify({ error: "No record or email in payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lang = templates[record.language] ? record.language : "fr";
    const t = templates[lang];
    const name = record.full_name || "";
    const plan = record.plan
      ? record.plan.charAt(0).toUpperCase() + record.plan.slice(1)
      : "";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: record.email,
        subject: t.subject,
        html: t.body(name, plan),
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify({ ok: res.ok, data }), {
      status: res.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
