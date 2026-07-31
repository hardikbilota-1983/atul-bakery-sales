# Weekly franchisor email report (Gmail SMTP)
#
# 1) On the Google account atulbakeryhillside@gmail.com:
#    - Turn on 2-Step Verification
#    - Create an App Password: https://myaccount.google.com/apppasswords
#      (App = Mail, Device = Other → "Sales Report")
# 2) Set env vars on Render (and local .env) — see below.
# 3) Test dry run, then force send:
#      curl -X POST "https://atul-bakery-sales.onrender.com/api/reports/weekly?dryRun=1" \
#        -H "Authorization: Bearer YOUR_CRON_SECRET"
#      curl -X POST "https://atul-bakery-sales.onrender.com/api/reports/weekly?force=1" \
#        -H "Authorization: Bearer YOUR_CRON_SECRET"
#
# GitHub secrets: REPORT_APP_URL, CRON_SECRET
# Schedule: .github/workflows/weekly-report.yml (Sun ~11:59 PM Eastern)
#
# From address is always the Gmail account (GMAIL_USER / REPORT_FROM).

REPORT_ENABLED=false
CRON_SECRET=change-me-to-a-long-random-string
GMAIL_USER=atulbakeryhillside@gmail.com
GMAIL_APP_PASSWORD=
REPORT_FROM=atulbakeryhillside@gmail.com
REPORT_TO=franchisor@example.com,owner@example.com
# Comma-separated Clover category names (defaults to dashboard watch list if empty)
REPORT_CATEGORIES=AB - Cake 2LB,AB - Cake 1LB,AB - Pastries,AB - Puffs,AB - Snacks,H - Deluxe Ice Cream,H - Ice creams and Shakes,H - Premium Ice Cream,H - Traditional Ice Cream,PCE - Chaaps,PCE - Dosas,PCE - Idli,PCE - Momos,PCE - Snacks South Indian,PCE - Specialty Dosas,PCE - Wraps
