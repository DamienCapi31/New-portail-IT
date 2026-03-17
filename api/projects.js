const CLICKUP_API = 'https://api.clickup.com/api/v2';
const LIST_PROJETS = process.env.CLICKUP_LIST_PROJETS;

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
    const data = await cuFetch(`/list/${LIST_PROJETS}/task?include_closed=false&limit=100`);

    const projects = (data.tasks || []).map((t) => ({
      id: t.id,
      name: t.name,
      status: (t.status?.status || '').toLowerCase(),
      assignees: (t.assignees || []).map((a) => ({
        i: a.initials || a.username?.slice(0, 2) || '?',
        p: a.profilePicture || null
      }))
    }));

    res.status(200).json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}