# Phone Verification Setup Guide

This guide will help you set up phone verification in your Supabase project.

## Prerequisites

- A Supabase project (already configured)
- Access to your Supabase dashboard
- An SMS provider account (Twilio recommended)

## Step 1: Add Phone Number Column to Profiles Table

1. Go to your Supabase Dashboard → **SQL Editor**
2. Run this SQL to add the `phone_number` column:

```sql
-- Add phone_number column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Add index for faster phone number searches
CREATE INDEX IF NOT EXISTS idx_profiles_phone_number 
ON profiles(phone_number);

-- Add comment
COMMENT ON COLUMN profiles.phone_number IS 'Verified phone number in E.164 format';
```

## Step 2: Configure Supabase Auth for Phone Authentication

1. Go to **Authentication** → **Providers** in your Supabase dashboard
2. Find **Phone** provider and enable it
3. Configure the following settings:
   - **Enable phone provider**: Toggle ON
   - **Confirm phone**: Toggle ON (requires verification)
   - **Phone OTP expiry**: 3600 seconds (1 hour) - adjust as needed

## Step 3: Set Up SMS Provider (Twilio)

### Option A: Use Twilio (Recommended)

1. **Create a Twilio Account**:
   - Go to [twilio.com](https://www.twilio.com) and sign up
   - Get a phone number (or use trial number for testing)

2. **Get Twilio Credentials**:
   - Account SID
   - Auth Token
   - Phone number (in E.164 format, e.g., +1234567890)

3. **Configure in Supabase**:
   - Go to **Project Settings** → **Auth** → **SMS Auth**
   - Select **Twilio** as SMS provider
   - Enter your Twilio credentials:
     - **Twilio Account SID**
     - **Twilio Auth Token**
     - **Twilio Phone Number** (sender number)

### Option B: Use Supabase's Built-in SMS (Limited)

Supabase offers a built-in SMS service, but it has limitations:
- Only works in certain regions
- Limited to development/testing
- May require upgrade for production

To use it:
- Go to **Project Settings** → **Auth** → **SMS Auth**
- Select **Supabase** as SMS provider
- Note: This may not work for all phone numbers

## Step 4: Configure SMS Templates

1. Go to **Authentication** → **Templates** → **SMS Templates**
2. Customize the **Phone OTP** template:

```
Your MoveTogether verification code is: {{ .Code }}

This code will expire in 10 minutes.
```

3. Save the template

## Step 5: Set Up Row Level Security (RLS) for Phone Numbers

1. Go to **SQL Editor** and run:

```sql
-- Allow users to update their own phone number
CREATE POLICY "Users can update own phone number"
ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow users to read phone numbers (for friend finding)
-- Note: You may want to restrict this further based on your privacy needs
CREATE POLICY "Users can read phone numbers for friend search"
ON profiles
FOR SELECT
USING (true); -- Or restrict to friends only if you have a friends table
```

## Step 6: Test Phone Verification

### Test in Development:

1. Use a test phone number from Twilio (if using Twilio trial)
2. Or use your own phone number for testing
3. Try the onboarding flow:
   - Enter phone number
   - Receive SMS code
   - Enter code to verify

### Common Issues:

**Issue: "Failed to send verification code"**
- Check Twilio credentials are correct
- Verify Twilio account has sufficient balance
- Check phone number format (must be E.164: +1234567890)
- Ensure phone provider is enabled in Supabase

**Issue: "Invalid verification code"**
- Codes expire after the configured time (default 1 hour)
- Codes are single-use
- Check that code is entered correctly (6 digits)

**Issue: "Phone number already in use"**
- Supabase prevents duplicate phone numbers by default
- If a user already verified this number, they need to use that account
- You may want to add logic to handle this case

## Step 7: Environment Variables (Already Set)

Your app already uses:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

No additional environment variables needed for phone auth - Supabase handles it server-side.

## Step 8: Optional - Add Phone Number Uniqueness Constraint

To ensure phone numbers are unique:

```sql
-- Add unique constraint on phone_number
-- Note: This will fail if you have existing duplicate phone numbers
-- Remove duplicates first if needed

ALTER TABLE profiles 
ADD CONSTRAINT unique_phone_number 
UNIQUE (phone_number);
```

## Step 9: Production Considerations

### For Production:

1. **Upgrade Twilio Account**:
   - Trial accounts have limitations
   - Upgrade to paid account for production
   - Consider purchasing a dedicated phone number

2. **Rate Limiting**:
   - Supabase has built-in rate limiting
   - Configure in **Project Settings** → **Auth** → **Rate Limits**
   - Recommended: 5 OTP requests per hour per phone number

3. **Costs**:
   - Twilio charges per SMS (varies by country)
   - US numbers: ~$0.0075 per SMS
   - International: varies by country
   - Monitor usage in Twilio dashboard

4. **Compliance**:
   - Ensure compliance with SMS regulations (TCPA in US)
   - Users must consent to receive SMS
   - Include opt-out instructions if required

## Verification Checklist

- [ ] `phone_number` column added to profiles table
- [ ] Phone provider enabled in Supabase Auth
- [ ] SMS provider configured (Twilio or Supabase)
- [ ] SMS template customized
- [ ] RLS policies set up
- [ ] Tested with real phone number
- [ ] Production SMS provider account ready (if going to production)

## Troubleshooting

### Check Supabase Logs:
- Go to **Logs** → **Auth Logs** in Supabase dashboard
- Look for errors related to phone authentication

### Check Twilio Logs:
- Go to Twilio Console → **Monitor** → **Logs**
- Check for failed SMS attempts

### Common Error Messages:

- **"Invalid phone number"**: Phone number must be in E.164 format (+1234567890)
- **"SMS provider not configured"**: Set up Twilio in Supabase settings
- **"Rate limit exceeded"**: Too many requests, wait before retrying
- **"Phone number already exists"**: Number already verified by another user

## Next Steps

Once setup is complete:
1. Test the onboarding flow end-to-end
2. Verify phone numbers are being saved to profiles table
3. Test friend finding by phone number
4. Monitor SMS costs and usage

For more help, check:
- [Supabase Phone Auth Docs](https://supabase.com/docs/guides/auth/phone-login)
- [Twilio Documentation](https://www.twilio.com/docs)
