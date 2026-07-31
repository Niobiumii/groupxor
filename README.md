# Telegram Subscription Bot

A customizable Telegram subscription bot for selling a digital product with:

- dynamic bot menus
- editable subscription plans
- manual payment proof review
- automatic private channel invite delivery after approval
- a password-protected web admin panel

## Stack

- Node.js
- TypeScript
- Telegraf
- Express
- EJS
- SQLite via `better-sqlite3`

## Features

- Customizable main menu stored in SQLite
- Built-in plan list and support screens
- Custom text and custom URL menu items
- Manual payment workflow with screenshot, document, or transaction ID proof
- Admin approval and rejection from:
  - Telegram admin chat buttons
  - Web admin dashboard
- Automatic one-time invite link generation for a private Telegram channel
- Editable bot copy, payment instructions, and plan metadata

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

3. Fill in `.env`:

- `BOT_TOKEN`: token from `@BotFather`
- `BOT_USERNAME`: your bot username without `@`
- `ADMIN_CHAT_ID`: Telegram user or group chat ID that receives payment proofs
- `PRIVATE_CHANNEL_ID`: private channel ID the bot should grant access to
- `ADMIN_PANEL_PASSWORD`: password for the web admin panel
- `SESSION_SECRET`: random long string
- `PORT`: web server port
- `BASE_URL`: base URL for your deployment
- `DB_PATH`: SQLite file path

4. Make sure the bot has the right Telegram permissions:

- add the bot to your private channel as an admin
- allow it to create invite links
- if you use a group as `ADMIN_CHAT_ID`, add the bot there too

5. Run in development:

```bash
npm run dev
```

6. Open the admin panel:

- `http://localhost:3000/admin`

## Admin Panel

Use the admin panel to:

- edit bot text and payment instructions
- update the admin chat ID and private channel ID
- create, reorder, activate, and delete plans
- create, reorder, activate, and delete menu items
- approve or reject submitted payment requests

## Menu Types

- `plans`: opens the dynamic plan list
- `support`: shows the support text from settings
- `custom_text`: sends custom text configured in the menu item
- `custom_url`: opens an external URL button

## Payment Flow

1. User opens the bot and taps a menu item.
2. User selects a plan.
3. Bot shows manual payment instructions.
4. User sends payment proof.
5. Admin reviews the request in Telegram or the web panel.
6. When approved, the bot sends a one-time private channel invite link.

## Build

```bash
npm run build
```

## Production Notes

- Put the app behind HTTPS in production.
- Replace the default session settings with secure cookies behind a reverse proxy.
- Add rate limiting and CSRF protection before public deployment.
- You can extend the current payment flow later with Stripe, Telegram Payments, or crypto providers.
