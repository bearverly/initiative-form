# Initiative Update Form

A custom HTML form that connects to Airtable with prefilled + locked fields.
The Airtable API token is kept secret via a Cloudflare Worker proxy.

---

## Project structure

```
airtable-form/
├── index.html   ← The form (deploy to GitHub Pages)
└── worker.js    ← Cloudflare Worker proxy (keeps your API token secret)
```

---

## Step 1 — Set up the Cloudflare Worker

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and create a free account.
2. In the sidebar go to **Workers & Pages → Create → Create Worker**.
3. Give it a name (e.g. `airtable-proxy`) and click **Deploy**.
4. Click **Edit code**, delete the default code, paste the contents of `worker.js`, and click **Deploy**.
5. Go to the worker's **Settings → Variables** tab and add these **Environment Variables** (use "Secret" for the token):

   | Variable name        | Value                                   |
   |---------------------|-----------------------------------------|
   | `AIRTABLE_TOKEN`     | Your Airtable Personal Access Token    |
   | `AIRTABLE_BASE_ID`   | e.g. `appXXXXXXXXXXXXXX`               |
   | `AIRTABLE_TABLE_NAME`| Exact table name as shown in Airtable  |
   | `ALLOWED_ORIGIN`     | Your GitHub Pages URL (see Step 3)     |

   > **Where to get your Airtable token:** airtable.com → Account → Developer Hub → Personal Access Tokens.  
   > **Where to get your Base ID:** open your base in Airtable, look at the URL: `airtable.com/appXXXXXX/...`

6. Note your Worker URL — it looks like `https://airtable-proxy.YOUR-SUBDOMAIN.workers.dev`

---

## Step 2 — Update index.html

Open `index.html` and replace the placeholder on this line near the bottom:

```js
const WORKER_URL = 'https://YOUR_WORKER_SUBDOMAIN.workers.dev/submit';
```

Paste your actual Worker URL + `/submit`.

---

## Step 3 — Deploy to GitHub Pages

1. Create a new **public** GitHub repository (e.g. `initiative-form`).
2. Push this folder's contents to the `main` branch.
3. In the repo go to **Settings → Pages**, set source to `main` branch / root folder, and click Save.
4. Your form will be live at: `https://YOURUSERNAME.github.io/initiative-form/`
5. Copy that URL and set it as `ALLOWED_ORIGIN` in your Cloudflare Worker variables (Step 1).

---

## Step 4 — Share prefilled links

Generate links in this format:

```
https://YOURUSERNAME.github.io/initiative-form/?scpo_owner=Jane+Smith&scpt_owner=Bob+Jones&annual_target=Increase+revenue+by+20%25&measure_of_success=Revenue+dashboard&fy26_q3_update=On+track+as+of+Q3&fy26_q4_update=Draft+Q4+notes+here
```

### URL parameter reference

| Parameter            | Field in Airtable                  | Locked? |
|---------------------|------------------------------------|---------|
| `scpo_owner`         | SCPO Owner                         | Yes     |
| `scpt_owner`         | SCPT Owner                         | Yes     |
| `annual_target`      | Annual Target                      | Yes     |
| `measure_of_success` | Measure of Success                 | Yes     |
| `fy26_q3_update`     | FY26 Q3 Update                     | Yes     |
| `fy26_q4_update`     | FY26 Q4 Update                     | No (editable) |

> **Tip:** Use `+` for spaces and `%25` for the `%` character in URL values.

---

## Field types in Airtable

Make sure your Airtable fields match these types:

| Field                                  | Type            |
|---------------------------------------|-----------------|
| SCPO Owner                             | Single line text |
| SCPT Owner                             | Single line text |
| Annual Target                          | Long text        |
| Measure of Success                     | Long text        |
| FY26 Q3 Update                         | Long text        |
| FY26 Q4 Update                         | Long text        |
| Initiative Health                      | Single select (options: Red, Yellow, Green) |
| Progress towards target achievement    | Number (0–100)   |
