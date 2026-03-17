const CLICKUP_API = 'https://api.clickup.com/api/v2';

const LIST_TICKETS = process.env.CLICKUP_LIST_TICKETS;
const LIST_BACKLOG = process.env.CLICKUP_LIST_BACKLOG;

const PMAP = { urgent: 1, high: 2, normal: 3, low: 4 };

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

async function cuPost(path, body) {
  const r = await fetch(`${CLICKUP_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: process.env.CLICKUP_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`ClickUp ${r.status}: ${text}`);
  }

  return r.json();
}

async function getCustomFields(listId) {
  const data = await cuFetch(`/list/${listId}/field`);
  return data.fields || [];
}

function findField(fields, name) {
  return fields.find((f) => (f.name || '').trim().toLowerCase() === name.trim().toLowerCase());
}

function getDropdownOptionId(field, label) {
  const options = field?.type_config?.options || [];
  const found = options.find((o) => (o.name || '').trim().toLowerCase() === String(label).trim().toLowerCase());
  return found?.id;
}

function buildCustomFields(fields, payload) {
  const out = [];

  const pushText = (fieldName, value) => {
    if (!value) return;
    const field = findField(fields, fieldName);
    if (!field) return;
    out.push({ id: field.id, value: String(value) });
  };

  const pushDropdown = (fieldName, value) => {
    if (!value) return;
    const field = findField(fields, fieldName);
    if (!field) return;
    const optionId = getDropdownOptionId(field, value);
    if (!optionId) return;
    out.push({ id: field.id, value: optionId });
  };

  pushText('Email', payload.email);
  pushDropdown('Service', payload.service);
  pushDropdown('Outil', payload.outil);
  pushDropdown('Criticité métier', payload.criticite);
  pushDropdown('Impact', payload.impact);
  pushDropdown('Type Ticket', payload.typeTicket)