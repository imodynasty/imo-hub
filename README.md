# IMO Dynasty Top 200 Ranker

GitHub Pages-ready version of the IMO Dynasty ranking board.

## Publish with GitHub Pages

1. Create a new **public** GitHub repository, e.g. `imo-dynasty-ranker`.
2. Upload `index.html` and `.nojekyll` to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch **main** and folder **/(root)**, then Save.
6. GitHub will provide a URL similar to `https://YOUR-USERNAME.github.io/imo-dynasty-ranker/`.

That HTTPS URL opens normally in Safari, Chrome, Messages, etc.

## Data behaviour

- Uses the live Sleeper NBA/player/2025 stats APIs first.
- Falls back to the embedded IMO player snapshot if Sleeper is unavailable.
- Saves drag/drop ranking in browser `localStorage` under `imo-dynasty-top200-v2`.
- Includes CSV Export + Import so rankings can be moved between devices/origins.
- Includes touch/pointer reordering for iPhone/iPad Safari.

## Moving your existing local ranking

The original local HTML and the hosted GitHub Pages site have different browser origins, so Safari/Chrome cannot automatically share their localStorage.

1. Open the old local ranker.
2. Click **Export CSV**.
3. Open the hosted GitHub Pages version.
4. Click **Import CSV** and choose that export.
5. The hosted site will then save the ranking locally on that device.
