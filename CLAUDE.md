# Računko (knjigovodja) – navodila za delo v repozitoriju

Spletna aplikacija je v `apps/web` (Next.js + Supabase, deploy na Vercel); glej tudi `apps/web/CLAUDE.md`.

## Baza znanja Računko asistenta – obvezno ob vsakem preletu

Asistent v aplikaciji (»💬 Asistent« v portalu, »?« na blagajni, `/api/support-chat`) odgovarja izključno iz `docs/knowledge-base/*.md`.

- **Vsak prelet, ki spremeni, kar uporabnik vidi ali dela** (strani, menije, gumbe, polja, postopke, pravice vlog, omejitve paketov), **mora v istem commitu posodobiti ustrezen dokument** v `docs/knowledge-base/`. Kateri dokument: `node apps/web/scripts/kb-vpliv.mjs <od>..HEAD` ali skill **`/update-kb`** (`.claude/skills/update-kb/SKILL.md`).
- Po spremembi dokumentov: `cd apps/web && node scripts/zgradi-bazo-znanja.mjs && npx playwright test tests/asistent.spec.ts`.
- Dokumenti opisujejo **dejansko delovanje kode** z natančnimi imeni gumbov in menijev iz kode.
- GitHub Action `Baza znanja asistenta` ob pushu na `main` opozori, če so se spremenile uporabniške datoteke brez dokumentov (deploya ne ustavi).
