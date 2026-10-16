module.exports = {
  ELW: { title: 'Eurolliga femenina', path: '/eurolliga-femenina.html', source: 'FIBA · EuroLeague Women', fiba: true },
  BCL: { title: 'Basketball Champions League', path: '/champions.html', source: 'FIBA · Basketball Champions League', fiba: true, gamesUrl: 'https://www.championsleague.basketball/en/games', standingsUrl: 'https://www.championsleague.basketball/en/standings' },
  TERCERA_EA: { title: 'Tercera FEB · Grup E-A', path: '/tercera-feb-ea.html', source: 'Federació Espanyola de Bàsquet (FEB)', febEdition: 'tercera-feb', febGroup: 'E-A', gamesUrl: 'https://competiciones.feb.es/estadisticas/resultados/8/2026', standingsUrl: 'https://competiciones.feb.es/estadisticas/resultados/8/2026' },
  LF: { febEdition: 'lf-endesa', title: 'Lliga Femenina Endesa', path: '/lf-endesa.html', source: 'Federació Espanyola de Bàsquet (FEB)', gamesUrl: 'https://beta.competiciones.feb.es/lf-endesa/partidos', standingsUrl: 'https://beta.competiciones.feb.es/lf-endesa/clasificacion' },
  ACB: { title: 'Lliga Endesa masculina', path: '/acb.html', source: 'ACB', adapter: 'acb', gamesUrl: 'https://www.acb.com/es/liga/partidos', standingsUrl: 'https://www.acb.com/es/liga/clasificacion' },
  E: { title: 'Eurolliga masculina', path: '/eurolliga.html', site: 'euroleague' },
  U: { title: 'EuroCup masculina', path: '/eurocup.html', site: 'eurocup' }
};
