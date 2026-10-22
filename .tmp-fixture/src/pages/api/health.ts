export const GET = () => new Response(JSON.stringify({ ok: true }), {
  headers: { 'content-type': 'application/json' },
});
