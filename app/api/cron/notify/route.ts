/**
 * Daily notification cron — fires at 11:00 UTC (6 AM ET) via vercel.json
 *
 * ── REQUIRED SUPABASE SETUP ─────────────────────────────────────────────────
 * Run this once in Supabase > SQL Editor before deploying:
 *
 *   CREATE TABLE notifications_sent (
 *     id        bigint generated always as identity primary key,
 *     user_id   uuid not null references auth.users(id) on delete cascade,
 *     sent_date date not null,
 *     UNIQUE (user_id, sent_date)   -- hard-limit: one row per user per day
 *   );
 *
 * ── REQUIRED ENV VARS (Vercel project settings) ─────────────────────────────
 *   SUPABASE_SERVICE_ROLE_KEY   Supabase > Project Settings > API > service_role
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER          e.g. +15551234567
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL           e.g. daily@yourdomain.com
 *   CRON_SECRET                 any random secret — Vercel sends it as Bearer token
 * ────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { Resend } from 'resend'

const APP_URL = 'https://daily-app-virid.vercel.app'

export async function GET(request: NextRequest) {
  // ── AUTH ────────────────────────────────────────────────────────────────
  // Vercel automatically sends Authorization: Bearer <CRON_SECRET> for cron routes.
  // Any other caller without the secret gets a 401.
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── SUPABASE (service role — bypasses RLS) ──────────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  // ── LOAD USERS ──────────────────────────────────────────────────────────
  const { data: users, error: usersError } = await supabase
    .from('user_settings')
    .select('user_id, email, phone')

  if (usersError) {
    console.error('Failed to read user_settings:', usersError)
    return NextResponse.json({ error: 'Failed to read users' }, { status: 500 })
  }

  if (!users?.length) {
    return NextResponse.json({ ok: true, date: today, message: 'No users found' })
  }

  // ── HARD DEDUP: who already received a notification today? ──────────────
  const { data: alreadySent } = await supabase
    .from('notifications_sent')
    .select('user_id')
    .eq('sent_date', today)

  const alreadySentIds = new Set((alreadySent ?? []).map(r => r.user_id as string))

  const pending = users.filter(u => !alreadySentIds.has(u.user_id))

  if (!pending.length) {
    return NextResponse.json({ ok: true, date: today, message: 'All users already notified today' })
  }

  // ── CLIENTS ─────────────────────────────────────────────────────────────
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  )
  const resend = new Resend(process.env.RESEND_API_KEY)

  const results = {
    date: today,
    sms:   { sent: 0, skipped: 0, errors: 0 },
    email: { sent: 0, skipped: 0, errors: 0 },
  }

  // ── SEND & RECORD ────────────────────────────────────────────────────────
  for (const user of pending) {
    // Record FIRST — unique constraint prevents double-sends even if the
    // endpoint is called concurrently or Vercel retries a timed-out invocation.
    const { error: logError } = await supabase
      .from('notifications_sent')
      .insert({ user_id: user.user_id, sent_date: today })

    if (logError) {
      // Unique violation means another concurrent run beat us to this user
      console.warn(`Skipping user ${user.user_id} — already logged (race condition)`)
      results.sms.skipped++
      results.email.skipped++
      continue
    }

    // SMS
    if (user.phone) {
      try {
        await twilioClient.messages.create({
          body: `Good morning. Your day is ready: ${APP_URL}`,
          from: process.env.TWILIO_FROM_NUMBER,
          to: user.phone,
        })
        results.sms.sent++
      } catch (err) {
        console.error(`SMS error for ${user.user_id}:`, err)
        results.sms.errors++
      }
    } else {
      results.sms.skipped++
    }

    // Email
    if (user.email) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? `daily@${new URL(APP_URL).hostname}`,
          to: user.email,
          subject: 'Good morning — your day is ready',
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 24px;background:#F5F0E8;font-family:'Courier New',monospace;color:#1A1814;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
    <tr>
      <td style="padding-bottom:24px;border-bottom:2px solid #1A1814;">
        <span style="font-size:12px;font-weight:600;letter-spacing:0.25em;text-transform:uppercase;">Daily</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 0 24px;">
        <p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#4A4640;">Good morning.</p>
        <p style="margin:0 0 32px;font-size:13px;line-height:1.7;color:#4A4640;">Your day is ready.</p>
        <a href="${APP_URL}"
           style="display:inline-block;background:#1A1814;color:#F5F0E8;padding:14px 28px;
                  font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.15em;
                  text-transform:uppercase;text-decoration:none;">
          Open Today →
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding-top:24px;border-top:1px solid rgba(26,24,20,0.15);">
        <p style="margin:0;font-size:10px;color:#C4BFB8;letter-spacing:0.05em;">${APP_URL}</p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        })
        results.email.sent++
      } catch (err) {
        console.error(`Email error for ${user.user_id}:`, err)
        results.email.errors++
      }
    } else {
      results.email.skipped++
    }
  }

  console.log('Cron notify complete:', results)
  return NextResponse.json({ ok: true, ...results })
}
