# Bàsquet al dia: instruccions de treball

## Conversa i delegació

- L'usuari treballa amb un únic xat principal. L'agent principal manté el context, pren les decisions, integra els canvis i presenta el resultat.
- Aquest projecte demana explícitament usar subagents quan hi haja una tasca independent que aporte valor: investigar una font oficial, diagnosticar una discrepància o revisar un canvi amb risc de regressions. El principal decideix quan convé, sense demanar de nou a l'usuari que organitze els agents.
- Per a retocs menuts o tasques estretament dependents, treballa amb un sol agent. No delegues només per complir una quota.
- Usa com a màxim dos subagents simultanis, sense delegació recursiva. Hereta el model i l'esforç del principal, llevat que l'usuari indique una altra preferència.
- Rols disponibles: `fonts_oficials` i `revisor`, definits en `.codex/agents/`. Si el client no carrega agents personalitzats, llig el TOML corresponent i passa les seues `developer_instructions` en el missatge d'un subagent genèric.
- Abans de delegar, fixa l'objectiu, l'abast, les evidències esperades i si es permet escriure. Els rols de suport són de lectura per instrucció; el principal és qui edita i integra. No són una barrera de permisos del sistema.
- El principal continua la faena independent, espera els resultats necessaris i resol les discrepàncies abans de donar el treball per acabat. Resumeix les conclusions sense obligar l'usuari a obrir altres xats.
- Si les eines de subagents no estan disponibles, continua amb un sol agent i explica breument aquesta limitació. No simules una revisió independent.

## Context del projecte

- Web lleugera de bàsquet per a Safari iOS 12.5.8. Consulta `README.md` i els fitxers afectats abans de canviar comportament; no prengues les xifres històriques del README com a estat actual de les fonts.
- Node.js >=22. `api/*.mjs` usa `lib/competition-handler.mjs`; els adaptadors són `lib/acb.js`, `lib/feb.js`, `lib/euroleague.js`, `lib/fiba.js` i `lib/national.js`.
- La vista compartida és `lib/euroleague-page.js`; TV i estadístiques FEB tenen serveis i vistes propis. `public/live-refresh.js` és el script del client. `scripts/build.js` genera `dist/`.
- Comprova el diff inicial i respecta qualsevol treball preexistent de l'usuari. Evita llegir massivament els fitxers temporals del directori arrel.

## Invariants

- Conserva la consulta i la navegació sense JavaScript. El JavaScript del client ha de continuar sent ES5, sense biblioteques pesades ni consultes esportives directes des de l'iPad.
- Publica únicament marcadors, estats, períodes, horaris i classificacions sustentats per la font. No inventes 0–0, rellotges, canals, grups, zones o classificacions històriques.
- Diferencia temporada, competició, fase, jornada i grup. Respecta els identificadors oficials i els enllaços existents.
- Les dades retingudes conserven l'hora original i l'avís de dades antigues; no les presentes com a directe vigent. Respecta la pausa, la pestanya oculta i les polítiques de memòria cau.
- Usa Europe/Madrid per a dates locals. Conserva els ressalts i les preferències editorials documentades, separats de les dades oficials.
- Verifica canvis de fonts i reglaments amb fonts oficials actuals. No executes scripts rebuts en HTML oficial.
- No exposes `.env*`, credencials ni sessions públiques FEB en respostes, logs, repositori o dades persistents. No reescrigues els arxius versionats de `data/` com a efecte secundari de proves.

## Verificació i entrega

- Per a canvis de codi, executa les proves pertinents amb `node --test tests/<fitxer>.test.js`. Abans d'entregar canvis de comportament, executa també `npm test` i `npm run build`; informa de qualsevol comprovació que no s'haja pogut fer.
- Usa dades controlades per reproduir regressions. Una prova de navegador modern o dades simulades no certifica l'iPad real ni un directe real.
- Per a canvis només de documentació/configuració d'agents, comprova sintaxi, enllaços locals i coherència; no cal executar la suite esportiva.
- Actualitza el README quan canvie el comportament o la forma de treballar. No afegisques dependències ni refactors aliens a la tasca.
- Els canvis a `main` es publiquen automàticament. L’usuari autoritza de manera permanent fer commit, push i desplegar els canvis del projecte després de validar-los, llevat que indique expressament el contrari. No cal demanar una confirmació addicional per a correccions ordinàries de la web.
- L'entrega ha d'explicar breument què ha canviat, què s'ha verificat i què queda pendent, sense repetir els logs.

La guia per a l'usuari està en `docs/treball-amb-agents.md`.
