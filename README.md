# LinkedIn autopost (zdarma)

Posty z `calendar.json` se samy zveřejní na tvém osobním LinkedInu v naplánovaný čas. Běží na GitHub Actions (zdarma), takže nepotřebuješ zapnutý notebook. Nic jiného než předplatné Claude neplatíš.

```
Claude vytvoří vizuály + texty -> commit do repa (schválení = merge)
        |
GitHub Actions (každých 30 min v pracovní dny) -> publish.mjs
        |
oficiální LinkedIn API  ->  post (PDF carousel nebo obrázek) + první komentář
```

## Jednorázové nastavení (cca 30 minut, musíš ty: já nemůžu zakládat aplikace ani povolovat přístupy)

1. **LinkedIn aplikace.** Otevři https://www.linkedin.com/developers/apps/new, název třeba „Autopost“, vyber LinkedIn stránku, kterou spravuješ (SiteSpot nebo Leadora; stránku lze založit zdarma), nahraj libovolné logo. V záložce *Settings* klikni na *Verify* a ověř stránku jako její administrátor.
2. **Produkty.** V záložce *Products* požádej o **Share on LinkedIn** a **Sign In with LinkedIn using OpenID Connect**. Obojí je zdarma.
3. **Token.** Otevři https://www.linkedin.com/developers/tools/oauth/token-generator, vyber svou aplikaci, zaškrtni scopy `openid`, `profile`, `w_member_social`, klikni na *Request access token* a token zkopíruj. Platí **60 dní**. Poznač si datum vypršení.
4. **Ověření lokálně.** V `linkedin/` vytvoř soubor `.env` (je v `.gitignore`) s řádkem `LINKEDIN_ACCESS_TOKEN=tvůj_token` a spusť:
   ```bash
   node publish.mjs --whoami
   ```
   Vypíše tvé jméno a řádek `LINKEDIN_PERSON_URN=urn:li:person:...`. Ten přidej do `.env`.
5. **GitHub.** Složku `linkedin/` nahraj jako **nové soukromé repo** (např. `linkedin-autopost`; soukromé repo má na GitHub Free 2 000 minut Actions měsíčně, tohle spotřebuje zhruba čtvrtinu). V repu nastav:
   ```bash
   gh secret set LINKEDIN_ACCESS_TOKEN
   gh secret set LINKEDIN_PERSON_URN
   gh variable set LINKEDIN_TOKEN_EXPIRES --body 2026-12-19
   ```
   (`gh secret set` se zeptá na hodnotu, vložíš ji sám. Nikdy ji neposílej do chatu.) Datum nahraď skutečným datem vypršení tokenu.

Hotovo. Workflow se spouští samo. Ručně ho můžeš pustit v záložce *Actions → Publikace na LinkedIn → Run workflow*.

## Obsah je předem naplánovaný

V `calendar.json` je 12 postů (29. 10. až 8. 12. 2026, út a čt v 8:00). Nic se nekontroluje, každý se sám zveřejní ve svůj čas. Další várku vyrobí Claude na zavolání („připrav další týdny“): texty do `posts/*.json`, `node build.mjs && node render.mjs` vyrobí vizuály, položky přibudou do `calendar.json`.

**Pauza kdykoli:** `gh variable set PUBLISHING_PAUSED --body true --repo MaxHruby/linkedin-autopost` (zrušíš smazáním proměnné). Jeden post zadržíš přidáním `"hold": true` do jeho položky.

## Každých ~55 dní (2 minuty)

Token vyprší za 60 dní a LinkedIn zdarma nenabízí automatické obnovení. Deset dní předem workflow samo založí GitHub issue „Obnov LinkedIn token“ (přijde ti e-mail). Postup: kroky 3 a 5 (nový token, `gh secret set LINKEDIN_ACCESS_TOKEN`, nové datum ve `LINKEDIN_TOKEN_EXPIRES`).

## Jak to funguje, pojistky

- `calendar.json` je jediný zdroj pravdy: `when` (pražský čas), `document` (PDF carousel) nebo `image`, `text`, volitelně `firstComment` a `hold: true` (zadrží post).
- Post se publikuje jen když nastal jeho čas a ještě nevyšel (`state/published.json`). Zameškaný post starší než 24 hodin se sám nevypustí.
- Znaky `( ) [ ] { } < > @ # * _ ~ | \` se v textu automaticky escapují, jinak by je LinkedIn oříznul. Hashtagy tedy vyjdou jako obyčejný text.
- Workflow běží jen v pracovní dny (po–pá). Víkendový post by čekal na pondělí.
- Plánování přes oficiální API je v souladu s pravidly LinkedInu. Neautomatizujeme komentáře ani přihlašování za tebe.

## Co jsem otestoval a co ne

Testováno: načtení kalendáře, kontrola souborů a délek, přepočet časů včetně změny času, a celý průběh publikace (nahrání dokumentu a obrázku, vytvoření postu, komentář, ochrana před dvojí publikací) proti falešnému serveru, který napodobuje LinkedIn API podle jeho dokumentace.

**Netestováno proti skutečnému LinkedInu**, protože k tomu potřebuji tvůj token. První skutečný post proto pusť ručně a sleduj výstup: `node publish.mjs --send --only p1-audit-25-eshopu`. Pokud něco selže před vytvořením postu, nic nevyjde. Pokud selže jen první komentář, post je venku a skript to napíše.
