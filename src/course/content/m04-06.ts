import type { CourseModule } from '../types';

export const M4_6: CourseModule[] = [
  {
    id: '4',
    num: 4,
    title: 'Finn realistisk salgsverdi',
    goal: 'Lære brukeren å analysere exit før han begynner å drømme om kjøpet.',
    pages: [
      {
        id: '4.1',
        title: 'Start med hva boligen kan selges for',
        blocks: [
          {
            t: 'p',
            x: 'Salgsverdien er én av de viktigste variablene i hele prosjektet. Du kan påvirke oppussingskostnaden, men du bestemmer ikke hva kjøperne vil betale.',
          },
          {
            t: 'p',
            x: 'Derfor skal ingen flipp ha bare ett salgstall. Én «magisk» forventet salgspris skjuler usikkerheten i stedet for å vise den. Bruk i stedet tre tall: lav, base og høy.',
          },
          {
            t: 'cards',
            items: [
              { title: 'Lav', x: 'Et realistisk dårlig utfall.' },
              { title: 'Base', x: 'Det best begrunnede normalutfallet basert på informasjonen i dag.' },
              { title: 'Høy', x: 'Et godt, men fremdeles plausibelt utfall.' },
            ],
          },
        ],
      },
      {
        id: '4.2',
        title: 'Sammenlignbare salg',
        blocks: [
          {
            t: 'p',
            x: 'Sammenlign med boliger i samme område og av omtrent samme størrelse og eierform. Se også på etasje, heis, balkong, parkering, antall soverom, planløsning og standard. Utsikt og lys kan bety mye der det er relevant.',
          },
          {
            t: 'box',
            kind: 'flagg',
            x: [
              'Prisantydning er ikke det samme som oppnådd salgspris.',
              'En gammel annonse merket «solgt» uten dokumentert salgssum er ikke dokumentasjon på faktisk oppnådd pris.',
            ],
          },
          {
            t: 'p',
            x: 'På Marked-fanen på hvert objekt i Flippsjekk kan du se grunnlagets sammenlignbare objekter og legge inn dine egne, med prisantydning, solgt pris, felleskostnader, solgt totalpris, areal, kr/m², dato og merknad.',
          },
        ],
      },
      {
        id: '4.3',
        title: 'Ta temperaturen på markedet i dag',
        blocks: [
          {
            t: 'p',
            x: 'Historiske salg er ikke nok. Undersøk også hva som ligger ute nå, hvor mange konkurrenter det er, prisnivået og hvor lenge objektene har ligget ute. Se om prisene reduseres, hvilke objekter som ikke selges og hvilke standarder kjøperne velger.',
          },
          {
            t: 'p',
            x: 'Et historisk salg viser hva noen betalte da. Aktive annonser viser hva selgere håper å få nå. Ingen av delene er alene en fasit, så du må kombinere informasjonen.',
          },
          { t: 'h', x: 'Aktuelt nå – datostemplet' },
          { t: 'widget', id: 'market' },
          {
            t: 'box',
            kind: 'forklart',
            x: ['Dette betyr ikke at ditt konkrete objekt har økt 2,8 %. Makrotall er bakgrunn. Flipperen må analysere mikromarkedet.'],
          },
        ],
      },
      {
        id: '4.4',
        title: 'Bruk meglere som datakilde',
        blocks: [
          {
            t: 'p',
            x: 'Snakk med to–tre meglere som selger tilsvarende objekter. Gode spørsmål er:',
          },
          {
            t: 'quote',
            x: [
              '«Hva tror du denne typen bolig realistisk kan oppnå etter en god oppussing?»',
              '«Hva forventer kjøperne i dette prissjiktet?»',
              '«Hvilke objekter blir liggende?»',
              '«Hvor mye verdi tror du et ekstra lovlig soverom har i akkurat dette markedet?»',
              '«Hvilken standard gir normalt best forhold mellom oppussingskostnad og salgbarhet?»',
            ],
          },
          {
            t: 'box',
            kind: 'tips',
            x: ['Meglerens vurdering er et datapunkt, ikke en fasit. En megler kan ha interesse av å fremstå optimistisk for å vinne ditt senere salgsoppdrag.'],
          },
          {
            t: 'p',
            x: 'Hvis prosjektet bare fungerer fordi du antar at markedet skal stige mens du pusser opp, er marginen for svak. Dersom dagens sammenlignbare salg tilsier 3,8 millioner, skal du normalt ikke gjøre basisscenarioet til 3,95 millioner.',
          },
          { t: 'box', kind: 'husk', x: ['Ikke bygg nødvendig markedsvekst inn i basisscenarioet. Markedsvekst er bonus, ikke forretningsmodellen.'] },
        ],
      },
    ],
    quiz: [
      {
        id: 'k4-1',
        question: 'En identisk leilighet ligger ute til 4,2 millioner. Betyr det at din ferdige leilighet er verdt 4,2 millioner?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Prisantydning er ikke oppnådd salgspris. Du må kombinere flere datapunkter.',
      },
      {
        id: 'k4-2',
        question: 'Hvor bør forventet generell markedsvekst normalt plasseres?',
        options: [
          'Som nødvendig del av basisscenarioet',
          'Som mulig oppside, ikke nødvendig for at basisscenarioet skal fungere',
          'Alltid 5 %',
        ],
        correct: 1,
        explain: 'Hvis prosjektet bare fungerer fordi markedet stiger, er marginen for svak.',
      },
    ],
  },

  {
    id: '5',
    num: 5,
    title: 'Planlegg verdiskapingen',
    goal: 'Lære brukeren hva han faktisk skal gjøre med boligen og hvorfor.',
    pages: [
      {
        id: '5.1',
        title: 'Oppussing er ikke målet',
        blocks: [
          { t: 'lead', x: 'Målet er ikke å pusse opp mest mulig. Målet er å bruke penger der markedet betaler deg tilbake.' },
          { t: 'p', x: 'Verdiskaping kan deles i tre typer, og de har ulik risiko og ulik betalingsvilje hos kjøperne.' },
          {
            t: 'cards',
            items: [
              { title: 'Fjerne problemer', x: 'Slitte overflater, dårlig belysning og kaotisk uttrykk. Dette er det kjøperen ser først.' },
              { title: 'Bedre funksjonalitet', x: 'Oppbevaring, møblerbarhet og planløsning.' },
              {
                title: 'Endre boligens markedsposisjon',
                x: 'For eksempel å gjøre en ettroms til en funksjonell toroms, dersom det kan gjøres lovlig og godt.',
              },
            ],
          },
          {
            t: 'p',
            x: 'Måten å tenke på er alltid den samme: Hvor mye mer vil kjøperen faktisk betale? Å flytte vask, komfyr, toalett eller sluk fordi det «ser penere ut» kan være en dårlig investering.',
          },
        ],
      },
      {
        id: '5.2',
        title: 'Kosmetisk eller teknisk?',
        blocks: [
          {
            t: 'compare',
            a: { title: 'Kosmetisk oppgradering', x: 'Maling, gulv, lister, fronter, belysning og overflater.' },
            b: { title: 'Teknisk oppgradering', x: 'Bad, rør, elektrisk, ventilasjon, avløp og konstruksjon.' },
          },
          {
            t: 'p',
            x: 'En sliten bolig kan være et bedre objekt enn en pen bolig dersom de kostbare tekniske delene er gode. Og motsatt: nymalte vegger kan skjule et prosjekt med stor teknisk risiko.',
          },
          {
            t: 'p',
            x: 'Derfor skal du, før du planlegger fliser og farger, vite hvilke tekniske deler som må gjøres. Det er der de store og uforutsette kostnadene ligger.',
          },
        ],
      },
      {
        id: '5.3',
        title: 'Flytte kjøkken og lage ekstra soverom',
        blocks: [
          {
            t: 'p',
            x: 'Dette er en klassisk flippstrategi. Ved å flytte kjøkkenet inn i stuen kan det gamle kjøkkenet bli et mulig soverom, og leiligheten kan gå fra ett til to soverom.',
          },
          { t: 'widget', id: 'kitchenPlan' },
          {
            t: 'p',
            x: 'Slike endringer kan skape mye verdi fordi de endrer hvem som kan tenke seg å kjøpe leiligheten. Men:',
          },
          { t: 'box', kind: 'flagg', x: ['Verdien kan ikke regnes inn som sikker før løsningen er teknisk og juridisk avklart.'] },
        ],
      },
      {
        id: '5.4',
        title: 'Vann, avløp og ventilasjon',
        blocks: [
          {
            t: 'p',
            x: 'Å få vann frem til et nytt kjøkken kan være relativt enkelt når kjøkkenet ligger tett på eksisterende vanninstallasjoner, for eksempel på motsatt side av en vegg. Avløpet er ofte vanskeligere. Det må fungere med nødvendig fall eller annen faglig forsvarlig løsning, ha tilstrekkelig kapasitet og være driftssikkert.',
          },
          {
            t: 'p',
            x: 'Lang rørføring påvirkes av gulvhøyde, bjelkelag, avstand, støy og tilgjengelighet. Pumpeløsning kan noen ganger være mulig, men den tilfører utstyr, strømavhengighet, vedlikehold, støy og en ny feilkilde.',
          },
          {
            t: 'p',
            x: 'Kjøkken trenger også tilfredsstillende avtrekk. I borettslag og sameier kan ventilasjonsanlegg og kanaler være fellesinstallasjoner. Ikke anta at du bare kan koble en kjøkkenvifte til eksisterende felles ventilasjon. Se etter hva laget tillater, om ny kanal kan føres lovlig og hvilke brannkrav som gjelder.',
          },
          {
            t: 'box',
            kind: 'tips',
            x: ['Få rørlegger og eventuelt relevant fagperson til å vurdere løsningen før du betaler for den i budrunden.'],
          },
        ],
      },
      {
        id: '5.5',
        title: 'Et rom er ikke et soverom bare fordi det står en seng der',
        blocks: [
          {
            t: 'p',
            x: 'Forskjellen mellom markedsføring og godkjent bruk er stor. Et mulig nytt soverom må blant annet vurderes mot godkjent rombruk, dagslys, ventilasjon, brann og rømning der relevant, rommets fysiske egenskaper og eventuell søknadsplikt. {{tek17|TEK17}} har blant annet krav til ventilasjon i soverom.',
          },
          {
            t: 'p',
            x: 'Kjøkken og soverom er {{hoveddel|hoveddel}}, men det betyr ikke at enhver endring automatisk er uproblematisk. Å gjøre bod til soverom er et tydeligere eksempel: bod er {{tilleggsdel|tilleggsdel}}, og endringen til hoveddel er normalt en {{bruksendring|bruksendring}} som krever søknad.',
          },
          { t: 'lead', x: 'Sjekk kommunens godkjente tegninger før du betaler for et «ekstra soverom».' },
          {
            t: 'box',
            kind: 'flagg',
            x: ['«Det ser ut som et soverom» er ikke det samme som «rommet er lovlig godkjent som soverom».'],
          },
          {
            t: 'box',
            kind: 'husk',
            x: ['Ikke verdsett et nytt soverom fullt ut før teknisk og juridisk gjennomførbarhet er avklart.'],
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'k5-1',
        question: 'Når kan du legge full verdi av et nytt soverom inn i basisscenarioet?',
        options: [
          'Så snart plantegningen ser mulig ut',
          'Når megler sier at «det pleier å gå»',
          'Når teknisk og juridisk gjennomførbarhet er tilstrekkelig avklart',
          'Alltid',
        ],
        correct: 2,
        explain: 'Verdien kan ikke regnes inn som sikker før løsningen er teknisk og juridisk avklart.',
      },
      {
        id: 'k5-2',
        question: 'Hva er ofte den vanskeligste delen ved å flytte et kjøkken?',
        options: ['Fargen på frontene', 'Avløp og tekniske føringer', 'Håndtakene'],
        correct: 1,
        explain: 'Vann er ofte enkelt. Avløpet må ha fall eller annen faglig forsvarlig løsning.',
      },
    ],
  },

  {
    id: '6',
    num: 6,
    title: 'Bygg hele prosjektbudsjettet',
    goal: 'Lære brukeren at «oppussingsbudsjett» og «flippbudsjett» ikke er det samme.',
    pages: [
      {
        id: '6.1',
        title: 'Alle kostnadene',
        blocks: [
          {
            t: 'p',
            x: 'En flipp har langt flere kostnader enn kjøpesum og oppussing. Dokumentavgift, finansiering, løpende felleskostnader og kostnadene ved et senere salg kan alene spise opp store deler av prisforskjellen mellom et oppussingsobjekt og en ferdig bolig. Del derfor prosjektet i syv deler.',
          },
          {
            t: 'cards',
            items: [
              { title: 'Kjøp', x: 'Kjøpesum og kjøpskostnader.' },
              { title: 'Oppussing', x: 'Materialer, fagfolk og andre tiltak.' },
              { title: 'Reserve', x: 'Usikkerhet.' },
              { title: 'Finansiering', x: 'Renter og finansieringskostnader.' },
              { title: 'Eiertid', x: 'Felleskostnader og annen drift.' },
              { title: 'Salg', x: 'Megler og andre salgskostnader.' },
              { title: 'Egen tid', x: 'Arbeidet brukeren selv legger inn.' },
            ],
          },
          { t: 'lead', x: 'Totalkostnad ≠ kjøpesum + oppussing' },
        ],
      },
      {
        id: '6.2',
        title: 'Dokumentavgift og kjøpskostnader',
        blocks: [
          {
            t: 'p',
            x: 'Selveier kan utløse dokumentavgift, mens borettslag normalt ikke har tilsvarende avgift. Dokumentavgift skal ikke bare legges inn som 2,5 % av et tilfeldig annonsetall. Kalkulatoren har derfor et eksplisitt avgiftsgrunnlag som du kan se og endre.',
          },
          {
            t: 'p',
            x: 'Ta også høyde for tinglysing, finansieringsgebyrer og andre faktiske kjøpskostnader. De er mindre enn dokumentavgiften, men de er ikke 0 kroner, og de ligger i kostnadene før du har begynt å pusse opp.',
          },
        ],
      },
      {
        id: '6.3',
        title: 'Oppussingsbudsjettet',
        blocks: [
          {
            t: 'p',
            x: 'Bygg budsjettet rom for rom og tiltak for tiltak. For hvert tiltak kan kalkulatoren ha materialer, elektriker, rørlegger, andre fag og egne timer. Slik ser du hvor pengene faktisk går, og hvor du er avhengig av tilbud.',
          },
          { t: 'widget', id: 'planningNumbers' },
          {
            t: 'p',
            x: 'Ikke presenter én pris som «normalprisen». Geografi, størrelse, standard, rigg, eksisterende forhold og omfang gjør forskjellen stor.',
          },
          {
            t: 'box',
            kind: 'flagg',
            x: ['Ikke legg inn 120 000 kr for totalrehabilitering av et bad bare fordi du trenger det tallet for å få flippregnestykket til å gå opp.'],
          },
          { t: 'widget', id: 'budget' },
        ],
      },
      {
        id: '6.4',
        title: 'Reserve og uforutsette utgifter',
        blocks: [
          {
            t: 'p',
            x: 'Standardeksempelet kan være 20 % reserve på oppussingen, men du skal kunne endre den. {{reserve|Reserve}} er ikke penger du kan bruke hvis du får lyst på dyrere fliser. Den er penger til forhold du ikke kjente til da du satte opp budsjettet.',
          },
          { t: 'lead', x: 'Reserve erstatter ikke analyse.' },
          {
            t: 'p',
            x: 'Hvis taket er uavklart, er ikke løsningen å ignorere taket og håpe at en 20 % interiørreserve dekker det. Skill mellom vanlig prosjektreserve og identifisert risiko.',
          },
          {
            t: 'box',
            kind: 'eksempel',
            x: [
              'Oppussing: 300 000 kr. Reserve 20 %: 60 000 kr.',
              'Men en mulig rørrehabilitering på 200 000 kr er en egen risiko, ikke «inkludert fordi vi har reserve».',
            ],
          },
          {
            t: 'p',
            x: 'Typiske «profit killers» er et bad som må totalrenoveres, sikringsskap og elanlegg, asbest eller miljøfarlige materialer og skjult fukt. Skjeve gulv og dårlige underlag, en forsinket håndverker, planlagt endring som styret stopper og en bruksendring som ikke var lovlig som antatt hører også med. Det samme gjelder felles rehabilitering som gir ny fellesgjeld og et svekket salgsmarked, der 5–10 % lavere pris kan utslette hele fortjenesten.',
          },
          {
            t: 'p',
            x: 'I et hus er en generell reserve på 20 % av interiøroppussingen ikke nødvendigvis tilstrekkelig dersom tak, drenering eller avløp er uavklart. Lag egne risikoposter.',
          },
          {
            t: 'p',
            x: 'Skill i risikobudsjettet mellom kjent kostnad og identifisert risiko. Eksempel: sannsynlig kostnad for bad 280 000 kr og mulig skjult tillegg 80 000 kr. Ikke sett alt til 0 frem til håndverkeren kommer.',
          },
          { t: 'widget', id: 'riskBudget' },
        ],
      },
      {
        id: '6.5',
        title: 'Finansiering, renter og løpende kostnader',
        blocks: [
          {
            t: 'p',
            x: 'I budsjettet må du ta med prosjektets varighet, finansiert andel og rente. Legg til felleskostnader, forsikring, strøm og kommunale kostnader der det er relevant. Jo lengre prosjektet varer, desto mer koster de.',
          },
          {
            t: 'box',
            kind: 'regel',
            title: 'Gjeldende utlånsforskrift',
            x: [
              'Forskriften har blant annet inntil 90 % belåningsgrad for ordinære nedbetalingslån med boligpant og samlet gjeld normalt inntil fem ganger brutto årsinntekt. Betjeningsevnen testes med høyeste av 7 % rente og aktuell rente + 3 prosentpoeng, og det er avdragskrav over 60 % belåningsgrad.',
            ],
          },
          {
            t: 'box',
            kind: 'avklares',
            x: [
              'Dette er rammer for bankenes utlånspraksis. Det betyr ikke at du har krav på slik finansiering. Fellesgjeld inngår også i relevante vurderinger av belåningsgrad.',
            ],
          },
        ],
      },
      {
        id: '6.6',
        title: 'Salgskostnad og egen arbeidstid',
        blocks: [
          {
            t: 'p',
            x: 'Ta med salgskostnadene i prosjektbudsjettet: megler, oppgjør, markedsføring, foto, tilstandsrapport, styling der det er relevant, vask og provisjon. Meglerpris er fritt avtalbar, så du skal innhente faktiske meglerpriser senere og sammenligne totalpris, ikke bare prosentsatsen.',
          },
          {
            t: 'p',
            x: 'Deretter kommer din egen tid. Egen tid har en alternativ økonomisk verdi, også når den ikke gir et skattefradrag.',
          },
          {
            t: 'box',
            kind: 'eksempel',
            x: [
              '500 egne timer. Prosjektresultat før verdsatt tid: 150 000 kr.',
              '150 000 / 500 = **300 kr per arbeidstime** – før eventuell skatt og samtidig med kapitalrisiko.',
            ],
          },
          { t: 'box', kind: 'husk', x: ['Egeninnsats er ikke gratisarbeid.'] },
        ],
      },
    ],
    quiz: [
      {
        id: 'k6-1',
        question: 'Du har 20 % reserve. Kan du derfor sette mulig dreneringskostnad til 0?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Reserve erstatter ikke analyse. Identifisert risiko er en egen post, og ukjent er aldri 0 kroner.',
      },
      {
        id: 'k6-2',
        question: 'Hva skal inngå i prosjektbudsjettet?',
        options: ['Bare kjøp og oppussing', 'Kjøp, oppussing og megler', 'Hele kostnaden fra kjøp til ferdig salg'],
        correct: 2,
        explain: 'Totalkostnad er mye mer enn kjøpesum pluss oppussing.',
      },
      {
        id: 'k6-3',
        question: 'Hvorfor verdsetter kurset egen tid?',
        options: ['Fordi tiden har en alternativ økonomisk verdi', 'Fordi Skatteetaten alltid gir fradrag for den', 'Fordi banken krever det'],
        correct: 0,
        explain: 'Egeninnsats er ikke gratisarbeid, selv om pengene ikke forlater bankkontoen.',
      },
    ],
  },
];
