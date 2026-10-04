# Modern Music Hub

**Learn. Create. Produce.** Piano by ear and music production lessons for teens and adults, in person in Charlottesville, VA and online with weekly live call-ins.

A static website (plain HTML, CSS and a little JavaScript, no build step) laid out like [amanorsac.studio](https://amanorsac.studio): full-width photo panels, paired tiles and a large footer, restyled with the Modern Music Hub v2 identity.

## Pages

| Page | What it covers |
| --- | --- |
| `index.html` | Home: the four programs, how it works, why it works, Showcase Night, parents, plans |
| `piano.html` | Piano by Ear: what you learn, the four-level path, who it's for, FAQ |
| `production.html` | Music Production in Fender Studio: skills, why Fender Studio, the producer path, FAQ |
| `online.html` | Online Hub: library, weekly live call-ins schedule, a week in the Hub, 7-day trial |
| `charlottesville.html` | In person: private lessons, Teen Producer Lab, adult classes, Beat Camp, the studio |
| `plans.html` | Programs (no prices yet), the free trial lesson form, FAQ |
| `about.html` | Founder story and what we believe |
| `brand.html` | Brand guide: logos, palette, program colours, type, voice, graphics, photography |

## Accounts, the Hub and the admin dashboard

| Page | Who | What |
| --- | --- | --- |
| `login.html` | Everyone | Sign in, or create an account |
| `hub.html` | Students | Home, My Learning (lessons by level with video and practice steps), Live Sessions, Feedback, Settings |
| `admin.html` | Admins and teachers | Overview, trial requests, students, lessons, live sessions, feedback queue, announcements |

- **The first account created becomes the admin.** Sign up at `/login.html` straight after the first deploy.
- New student sign-ups wait for approval: approve them under **Students** and choose their programs.
- The website's trial form saves into **Trial requests**. The call-in schedule on the Online Hub page comes from **Live sessions**, and meeting links are shown only to signed-in students.
- Lesson videos: paste a YouTube (unlisted is fine) or Vimeo link and it plays inside the Hub.
- Forgotten passwords: open the student under **Students** and press **Reset password** to get a temporary one to send them.

The backend is `worker.js` (Cloudflare Worker) with a Cloudflare D1 database bound as `DB`. Wrangler creates the database on the first deploy and the Worker creates its tables and starter lessons on the first request, so there is nothing to run by hand. Passwords are hashed with PBKDF2; sessions are HttpOnly cookies.

Run it locally with `npx wrangler dev --persist-to ../mmh-state` (keep the state folder outside the repo, or the dev server reloads itself).

## Editing

- **Contact details, social links and the weekly call-in times** live in the `MMH` block at the top of `assets/mmh.js`. The header and footer are drawn from there on every page.
- **Forms**: paste a [Formspree](https://formspree.io) endpoint into `MMH.formEndpoint`. Until then, the trial form opens the visitor's email app addressed to `MMH.email`.
- **Styles** are all in `assets/mmh.css`; the palette is defined as CSS variables at the top.

## Brand assets

`images/brand/` holds the logo as SVG (horizontal and stacked, on dark and on light), the mark, one-colour marks and the app icon. The wordmark is outlined Montserrat ExtraBold, so the files render the same everywhere without the font installed.

| Colour | Hex | Role |
| --- | --- | --- |
| Charcoal | `#111111` | Base |
| Warm Cream | `#F4EFE6` | Base |
| Pop Orange | `#FF6A2B` | Lead accent, Piano by Ear |
| Hot Pink | `#FF4D9D` | In person |
| Lime Pop | `#B8F23A` | Plans, progress |
| Ultra Violet | `#8B5CFF` | Production |
| Sky Pop | `#3EC8FF` | Online Hub |
| Sunshine | `#FFC93C` | Teen Producer Lab |

## Photos

The twelve photos were generated with Nano Banana Pro (Higgsfield). To save web-ready copies into the repo:

```sh
pip install pillow
python3 tools/fetch-photos.py
```

This writes `images/photos/<name>.webp` (2400px) and `<name>-1200.webp`; the copies in the repo were made this way. The site loads photos only from the repo, never from the Higgsfield CDN. They are placeholders: swap in real photos of the studio, teachers and students (with consent) when you have them. `images/photos/stephen-portrait.webp` is the real portrait from amanorsac.studio.

## To confirm before launch

Call-in times (all outside 8 AM to 5 PM on weekdays), the email address (placeholder), the studio address, ages, Beat Camp and adult class details, and the background-check statement are all written as sensible defaults. Check each one against how the academy actually runs.

## Preview locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Hours

Modern Music Hub is an extracurricular program: weekday sessions start at 5 PM, plus Saturdays and Sundays. Nothing is scheduled 8 AM to 5 PM on weekdays, and the site asks people to email rather than call. Groups are capped at six.

## Deploying

The site is served by the Cloudflare Worker `modernmusichub` as static assets (`wrangler.jsonc`). With the repository connected under Workers Builds, every push to `main` deploys. To deploy by hand: `npx wrangler deploy`.
