# FlagIQ Legal Pages

Static legal pages for FlagIQ (WildMoustacheGames), ready to deploy to Netlify or any static host. Files:

- `index.html` – landing page linking to legal documents
- `privacy.html` – Privacy Policy
- `terms.html` – Terms & Conditions
- `styles.css` – shared styling

## Deploying to Netlify

### Option 1: Drag-and-drop
1. No build step is required; these are plain HTML files.
2. Zip or select the `legal-site/` folder contents (all HTML and CSS files).
3. Go to <https://app.netlify.com/drop>, drop the folder or zip, and wait for the deploy to finish.
4. In Site settings, add your custom domain (e.g., `wildmoustachegames.com`) and follow Netlify’s DNS instructions (update DNS in GoDaddy to point to Netlify).

### Option 2: Connect a repository
1. Push these files to your repository.
2. In Netlify, choose **Add new site → Import an existing project**.
3. Select the repo and set the build settings:
   - **Build command:** leave empty (no build needed).
   - **Publish directory:** `legal-site`
4. Deploy the site. After the first deploy, add your custom domain in Site settings and point DNS records from GoDaddy to Netlify as instructed.

## Local preview
Open `legal-site/index.html` in your browser (double-click or `open legal-site/index.html`). No server or dependencies are required.

## Notes
- No JavaScript, analytics, or trackers are included.
- Update contact details or effective dates directly in `privacy.html` and `terms.html` if needed.
