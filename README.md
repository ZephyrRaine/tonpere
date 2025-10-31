Tonpere - Simple YouTube List Collector

A minimal Node + Express app that serves a form, accepts a name and a list of YouTube URLs (one per line), and stores submissions in `data/submissions.json` on the server.

Run locally

```
npm install
npm run start
# open http://localhost:3000
```

Run with Docker

```
# Build image
docker build -t tonpere:latest .

# Run container (maps port 3000 and persists data to ./data)
docker run --name tonpere \
  -e PORT=3000 \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  tonpere:latest

# Stop/remove
docker stop tonpere && docker rm tonpere
```

API
- POST /submit – body: name (string), videos (string, one URL per line)
- Success redirects to /thank-you.html for browsers or returns JSON when requested.

Data format

```
[
  {
    "id": "<generated>",
    "name": "Ada",
    "videos": ["https://youtu.be/..."],
    "createdAt": "2025-10-31T00:00:00.000Z"
  }
]
```

Notes
- File operations are synchronous for simplicity.
- No client-side JS required; the form posts directly to the server.


