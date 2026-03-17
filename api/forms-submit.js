import formidable from 'formidable';
import fs from 'node:fs/promises';

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const LIST_TICKETS = process.env.CLICKUP_LIST_TICKETS;
const LIST_BACKLOG = process.env.CLICKUP_LIST_BACKLOG;

const PMAP = { urgent: 1, high: 2, normal: 3, low: 4 };

function firstValue(value) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseForm(req) {
  const form = formidable({
    multiples: true,
    keepExtensions: true
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

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
  return fields.find(
    (f) => (f.name || '').trim().toLowerCase() === name.trim().toLowerCase()
  );
}

function getDropdownOptionId(field, label) {
  const options = field?.type_config?.options || [];
  const found = options.find(
    (o) => (o.name || '').trim().toLowerCase() === String(label).trim().toLowerCase()
  );
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
  pushDropdown('Type Ticket', payload.typeTicket);
  pushText('Objet SF', payload.objetSF);

  return out;
}

async function uploadAttachment(taskId, file) {
  const buffer = await fs.readFile(file.filepath);
  const blob = new Blob([buffer], {
    type: file.mimetype || 'application/octet-stream'
  });

  const form = new FormData();
  form.append('attachment', blob, file.originalFilename || 'piece-jointe');

  const r = await fetch(`${CLICKUP_API}/task/${taskId}/attachment`, {
    method: 'POST',
    headers: {
      Authorization: process.env.CLICKUP_API_KEY
    },
    body: form
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Upload attachment ${r.status}: ${text}`);
  }

  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fields, files } = await parseForm(req);

    const type = firstValue(fields.type);
    const email = firstValue(fields.email)?.trim();
    const service = firstValue(fields.service)?.trim();
    const outil = firstValue(fields.outil)?.trim();
    const criticite = firstValue(fields.criticite)?.trim();
    const impact = firstValue(fields.impact)?.trim();
    const titre = firstValue(fields.titre)?.trim();
    const description = firstValue(fields.description)?.trim();
    const priorite = firstValue(fields.priorite)?.trim();
    const typeDemande = firstValue(fields.typeDemande)?.trim();
    const importModule = firstValue(fields.importModule)?.trim();

    const attachments = toArray(files.attachments);

    if (!type || !email) {
      return res.status(400).json({
        error: 'Champs obligatoires manquants'
      });
    }

    let listId = '';
    let typeTicket = '';
    let taskPayload = {};
    let objetSF = '';

    if (type === 'urgence') {
      if (!service || !outil || !criticite || !titre || !description) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
      }

      listId = LIST_TICKETS;
      typeTicket = 'Incident urgent';
      taskPayload = {
        name: `[URGENT] ${titre}`,
        description,
        priority: 1,
        status: 'to do'
      };
    } else if (type === 'projet') {
      if (!service || !titre || !description || !priorite) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
      }

      listId = '901212828170';
      typeTicket = 'Demande de projet';
      taskPayload = {
        name: titre,
        description,
        priority: PMAP[priorite] || 3,
        status: 'A qualifier'
      };
    } else if (type === 'bug') {
      if (!service || !outil || !titre || !description || !impact || !priorite) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
      }

      listId = LIST_TICKETS;
      typeTicket = 'Bug / Incident IT';
      taskPayload = {
        name: `[BUG] ${titre}`,
        description,
        priority: PMAP[priorite] || 3,
        status: 'to do'
      };
    } else if (type === 'import') {
      if (!service || !priorite || attachments.length === 0) {
        return res.status(400).json({
          error: "Pour l'import, email, service, priorité et fichier sont obligatoires"
        });
      }

      listId = LIST_TICKETS;
      typeTicket = 'Import SF';
      objetSF = importModule || 'Import Salesforce';

      taskPayload = {
        name: `[IMPORT SF] ${objetSF}`,
        description: `Demande d'import Salesforce${importModule ? ` — ${importModule}` : ''}`,
        priority: PMAP[priorite] || 3,
        status: 'to do'
      };
    } else {
      return res.status(400).json({ error: 'Type de formulaire invalide' });
    }

    const customFields = await getCustomFields(listId);

    taskPayload.custom_fields = buildCustomFields(customFields, {
      email,
      service,
      outil,
      criticite,
      impact,
      typeTicket,
      typeDemande,
      objetSF
    });

    const task = await cuPost(`/list/${listId}/task`, taskPayload);

    let uploaded = 0;
    for (const file of attachments) {
      await uploadAttachment(task.id, file);
      uploaded++;
    }

    return res.status(200).json({
      ok: true,
      task_id: task.id,
      attachments_uploaded: uploaded
    });
  } catch (err) {
    console.error('forms-submit error:', err);
    return res.status(500).json({
      error: err.message || 'Erreur serveur'
    });
  }
}
