# WhatsApp Agent — setup

Floor staff message the company WhatsApp number to:

- **Record entries:** production (per machine and shift), fettling and dispatch. They can type it, send a voice note, or send a photo of the handwritten sheet, in English, Hindi or Marathi.
- **Ask questions:** anything the in-app ✨ assistant can answer, such as rejections, stock, OEE, CAPAs or calibration due.
- **Get documents:** "send SOP 001" replies with a 24-hour link to the approved (ACTIVE) document.

Nothing is saved straight from a message. The agent checks the entry against the machine, part and defect masters and shows a summary. The entry is saved only after the person taps **✅ Save** (or replies YES). Each entry is stamped with the person's name, `source: WhatsApp`, and an audit-trail line.

## 1. Meta (one-time, about 30 min)

1. Go to <https://developers.facebook.com> → **My Apps → Create app → Business**. Link it to the company's Meta Business account.
2. Add the **WhatsApp** product. Add the business phone number and verify it. This number must **not** already be in use on the WhatsApp phone app.
3. **Business settings → System users:** create a system user, give it the app with *Full control*, and generate a **permanent token** with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
4. Note these values:
   - the **Phone number ID** (WhatsApp → API setup)
   - the **App secret** (App settings → Basic)

## 2. Railway → Variables

| Variable | Value |
|---|---|
| `WHATSAPP_ENABLED` | `1` |
| `WHATSAPP_TOKEN` | the permanent system-user token |
| `WHATSAPP_PHONE_ID` | the phone number ID |
| `WHATSAPP_APP_SECRET` | the app secret (used to check that messages really come from Meta) |
| `WHATSAPP_VERIFY_TOKEN` | any long random text you choose |
| `GEMINI_API_KEY` | already set if the in-app assistant works |
| `PUBLIC_URL` | optional: the app's address, e.g. `https://vra-dms.up.railway.app`, if document links come out wrong |

Then redeploy.

## 3. Connect the webhook

In the Meta app go to **WhatsApp → Configuration → Webhook → Edit**:

- **Callback URL:** the address shown in VRA DMS under **Users → WhatsApp Agent** (`…/api/whatsapp/webhook`)
- **Verify token:** the same text as `WHATSAPP_VERIFY_TOKEN`

Click **Verify and save**, then **subscribe** to the `messages` field.

## 4. Allow numbers

In VRA DMS, open **Users → 💬 WhatsApp Agent** (approvers only) and add each person's number with country code.

- Tick **Can record entries** for supervisors and data-entry staff.
- Leave it unticked for people who should only ask questions and get documents.

Messages from numbers not on this list are refused.

> Any registered number can ask anything the assistant can read (HR, purchasing and so on). Register only staff who should have that access.

## Notes

- **Duplicate shifts:** a machine/shift that is already entered can't be entered again from WhatsApp. Corrections to saved entries are made in the software.
- **Fettling:** rows sent on WhatsApp are added to that date's fettling entry.
- **Expiry:** an unconfirmed entry expires after 6 hours, and document links expire after 24 hours.
- **Costs:** replies within 24 hours of the person's message are free service conversations on WhatsApp. The agent never starts conversations itself.
