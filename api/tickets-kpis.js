const CLICKUP_API = 'https://api.clickup.com/api/v2';
const LIST_TICKETS = process.env.CLICKUP_LIST_TICKETS;

async function cuFetch(path) {
  const r = await fetch(`${CLICKUP_API}${path}`, {
    headers: {
      Authorization: process.env.CLICKUP_API_KEY
    }
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`ClickUp ${r.status}: ${text}`);
  }

  return r.json();
}

export default async function handler(req, res) {
  try {
    let done = 0;
    let todo = 0;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const data = await cuFetch(
        `/list/${LIST_TICKETS}/task?include_closed=true&page=${page}&limit=100`
      );

      const tasks = data.tasks || [];

      for (const t of tasks) {
        const s = (t.status?.status || '').toLowerCase();

        if (s === 'done' || s === 'complete' || s === 'closed') {
          done++;
        } else if (s === 'to do') {
          todo++;
        }
      }

      hasMore = tasks.length === 100;
      page++;

      if (page > 20) break;
    }

    res.status(200).json({ done, todo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}