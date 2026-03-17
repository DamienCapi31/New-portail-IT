export default function handler(req, res) {
  const token = process.env.CLICKUP_API_KEY || '';
  res.status(200).json({
    hasToken: Boolean(token),
    startsWithPk: token.startsWith('pk_'),
    length: token.length
  });
}