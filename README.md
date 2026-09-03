<div align="center">

<img src="SiteIcon.png" width="260" alt="MILKBOX logo">

# MILKBOX

Personal media library for movies, TV shows, anime, and manga.

</div>

## Features

- Movies and TV show library
- Anime section powered by TMDB
- Manga catalog with covers and metadata
- MangaDex chapter reader with real page images
- Trending titles
- Streaming titles
- In-theater movies
- My List
- Google Drive playback
- Uploaded TV episodes
- About:Blank opener
- Custom themes and backgrounds
- Tab title, favicon, and logo customization
- Local browser storage for personal settings and library data

## Requirements

- Node.js 18 or newer
- pnpm

## Installation

```bash
pnpm i
```

Start the App
```
pnpm start
```
Then open:
```
http://localhost:3000
```
The app should be opened through the local server instead of opening index.html directly. The local server is required for the MangaDex proxy and manga chapter reader.

APIs
MILKBOX uses external services for live content:

TMDB for movies, TV shows, anime, trending titles, streaming information, and theater listings
Tenrai for manga metadata and covers
MangaDex for manga chapters and readable page images
API availability depends on the external services and their rate limits.

Manga Reader
Select a manga card to open the reader. The reader finds the matching MangaDex title, loads available chapters, and retrieves real chapter pages through the local server proxy.

Some manga may not have readable chapters available on MangaDex.

## Data Storage
User settings, custom library items, themes, and preferences are stored locally in the browser using localStorage.

No personal library data is stored in the project repository.

## Project Structure
```
.
├── app.js
├── index.html
├── styles.css
├── server.js
├── library.json
├── package.json
└── pnpm-lock.yaml
```

Disclaimer
MILKBOX is intended for personal media organization and playback. Content availability depends on the external services and sources used by the application.
