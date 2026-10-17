import type { CourseModule } from '../types';

export const M1_3: CourseModule[] = [
  {
    id: '1',
    num: 1,
    title: 'Slik fungerer en flipp',
    goal: 'Gi nybegynneren riktig tankesett før vi introduserer detaljer.',
    pages: [
      {
        id: '1.1',
        title: 'Hva er egentlig boligflipping?',
        blocks: [
          {
            t: 'p',
            x: 'Boligflipping betyr i dette kurset å kjøpe en bolig, gjennomføre tiltak som forbedrer boligens salgbarhet eller verdi og selge igjen med mål om økonomisk gevinst.',
          },
          { t: 'p', x: 'Den enkle historien er kort:' },
          { t: 'flow', steps: ['Kjøp', 'Puss opp', 'Selg dyrere'] },
          { t: 'p', x: 'Den virkelige historien er mye lengre. Det er ikke oppussingen som er vanskeligst, men alt som må være på plass før du i det hele tatt byr.' },
          {
            t: 'flow',
            title: 'Den virkelige historien',
            steps: ['Finn objekt', 'Undersøk', 'Estimer salgsverdi', 'Planlegg tiltak', 'Beregn alle kostnader', 'Vurder skatt', 'Stresstest', 'Beregn maksbud', 'Kjøp', 'Gjennomfør', 'Selg'],
          },
          {
            t: 'p',
            x: 'Det er vanligvis beslutningen før kjøpet som avgjør om prosjektet blir lønnsomt. Når kontrakten er signert, er det som regel for sent å rette opp en for høy kjøpesum med fine fliser.',
          },
          { t: 'lead', x: 'Fortjenesten skapes først og fremst når du kjøper riktig.' },
          { t: 'h', x: 'Fire typer opplysninger gjennom hele kurset' },
          {
            t: 'p',
            x: 'Gjennom kurset lærer du å skille mellom det som er dokumentert, det som er et anslag, det du selv legger til grunn og det som ikke er undersøkt. Ukjent betyr aldri 0 kroner.',
          },
          { t: 'widget', id: 'evidenceLegend' },
        ],
      },
      {
        id: '1.2',
        title: 'Prisforskjell er ikke fortjeneste',
        blocks: [
          {
            t: 'box',
            kind: 'eksempel',
            title: 'Den vanligste nybegynnerfeilen',
            x: [
              'En sliten leilighet koster 3 000 000 kr. En ferdig oppusset leilighet ser ut til å være verdt 3 500 000 kr. En nybegynner ser «500 000 kroner å tjene».',
              'Men 500 000 kroner er bare forskjellen mellom to boligpriser. Det er ikke fortjenesten din.',
            ],
          },
          {
            t: 'p',
            x: 'Mellom kjøp og salg ligger kjøpskostnader, oppussing, reserve, renter, løpende kostnader, salgskostnader, din egen arbeidstid og eventuell skatt. Hver av dem tar sin del av de 500 000 kronene, og noen av dem er større enn du tror.',
          },
          {
            t: 'formula',
            lines: ['Salgspris', '– kjøpesum', '– alle prosjektkostnader'],
            result: '= resultat før skatt og verdsatt egeninnsats',
          },
          {
            t: 'p',
            x: 'I modul 8 regner du dette ut med en ekte kalkulator, og i case A ser du hvordan nettopp denne leiligheten kan gå i minus selv om prisforskjellen er 500 000 kroner.',
          },
        ],
      },
      {
        id: '1.3',
        title: 'Hvem konkurrerer du med?',
        blocks: [
          { t: 'p', x: 'Du konkurrerer ikke bare mot andre flippere. Tre ulike aktører påvirker hva du kan betale.' },
          {
            t: 'cards',
            items: [
              {
                title: 'En som skal bo der selv',
                x: 'Denne kjøperen trenger ikke tjene penger på å selge igjen om seks måneder. Han kan eie boligen i ti år og kan derfor betale mer enn en flipper.',
              },
              {
                title: 'En erfaren flipper',
                x: 'Kan ha bedre håndverkerpriser, mer erfaring, raskere prosjekt, materialavtaler og bedre finansiering enn deg.',
              },
              { title: 'Deg', x: 'Du må finne ut hva boligen er verdt for ditt prosjekt.' },
            ],
          },
          { t: 'lead', x: 'Markedspris og riktig flipppris er ikke nødvendigvis det samme.' },
          {
            t: 'p',
            x: 'Spørsmålet er derfor ikke hva boligen er verdt for andre. Spørsmålet er hva du maksimalt kan betale og fortsatt få tilstrekkelig betalt for kapitalen, tiden og risikoen din.',
          },
        ],
      },
      {
        id: '1.4',
        title: 'Margin, tid og risiko',
        blocks: [
          {
            t: 'p',
            x: 'Et prosjekt som forventes å gi 100 000 kroner kan være dårligere enn det høres ut dersom det krever 500 arbeidstimer og innebærer risiko for et tap på flere hundre tusen kroner. Derfor stiller vi tre krav til en flipp.',
          },
          {
            t: 'steps',
            items: [
              { title: 'Margin', x: 'Det må være nok penger mellom kostnader og realistisk salgspris.' },
              { title: 'Kontrollerbar risiko', x: 'De største ukjente forholdene må enten undersøkes eller prises inn.' },
              { title: 'Betaling for tiden', x: 'Egeninnsats er ikke gratis bare fordi pengene ikke forlater bankkontoen.' },
            ],
          },
          { t: 'box', kind: 'husk', x: ['En god flipp skal tåle at ikke alt går perfekt.'] },
        ],
      },
    ],
    quiz: [
      {
        id: 'k1-1',
        question: 'En bolig kjøpes for 3,0 millioner og du tror den kan selges for 3,5 millioner etter oppussing. Har du dermed omtrent 500 000 kroner i fortjeneste?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Prisforskjellen må først dekke alle kjøps-, oppussings-, finansierings-, drifts- og salgskostnader.',
      },
      {
        id: 'k1-2',
        question: 'Hvor skapes normalt den viktigste økonomiske sikkerhetsmarginen?',
        options: ['Når du velger fliser', 'Når du forhandler meglerprovisjonen', 'Når du kjøper objektet til riktig pris', 'Når du tar fine bilder'],
        correct: 2,
        explain: 'Fortjenesten skapes først og fremst når du kjøper riktig.',
      },
    ],
  },

  {
    id: '2',
    num: 2,
    title: 'Finn og grovsorter objekter',
    goal: 'Lære brukeren å forstå hva han faktisk ser på før tiden brukes på full analyse.',
    pages: [
      {
        id: '2.1',
        title: 'Førstesjekken av en boligannonse',
        blocks: [
          {
            t: 'p',
            x: 'En annonse er markedsføring. Den er bare inngangen til analysen, og det er lett å bruke for mye tid på bilder og tekst som sier lite om økonomien.',
          },
          { t: 'p', x: 'Brukeren skal ikke begynne med spørsmålet «Liker jeg denne boligen?». Spørsmålet er:' },
          { t: 'lead', x: 'Er det realistisk at denne boligen kan ha en margin jeg kan arbeide videre med?' },
          { t: 'p', x: 'For å svare på det henter du først ut de harde opplysningene i annonsen. Grupper dem slik at du ser helheten.' },
          {
            t: 'table',
            caption: 'Opplysninger du henter ut fra annonsen',
            head: ['Gruppe', 'Det du leter etter'],
            rows: [
              ['Boligen', 'Boligtype, eierform, BRA-i, antall rom og soverom, byggeår, etasje, heis og parkering'],
              ['Prisen', 'Prisantydning eller kontantpris, fellesgjeld, felleskostnader og total- eller gjeldsinkludert pris'],
              ['Tidspunkt', 'Neste visning'],
            ],
          },
          {
            t: 'box',
            kind: 'tips',
            x: ['Noter opplysningene som dokumentert fakta bare når de står i annonsen eller i dokumentene. Det du ikke finner, er uavklart, ikke 0 kroner.'],
          },
        ],
      },
      {
        id: '2.2',
        title: 'Selveier og eierseksjon',
        blocks: [
          {
            t: 'p',
            x: 'Ved en {{eierseksjon|eierseksjon}} eier du selve seksjonen som fast eiendom, og i tillegg en andel av fellesskapet. Selveier medfører normalt dokumentavgift ved ordinær overføring av fast eiendom.',
          },
          {
            t: 'box',
            kind: 'regel',
            title: 'Dokumentavgift og tinglysing i 2026',
            x: [
              'Gjeldende ordinær sats for {{dokumentavgift|dokumentavgift}} er **2,5 % av avgiftsgrunnlaget**.',
              'Tinglysingsgebyret for et ordinært dokument er i 2026 **545 kr**.',
            ],
          },
          {
            t: 'box',
            kind: 'avklares',
            x: ['Dette betyr ikke at alle kjøp automatisk har nøyaktig disse kostnadene. Avgiftsgrunnlag og dokumenter må vurderes konkret. Dokumentavgift skal ikke bare regnes av prisantydningen.'],
          },
          {
            t: 'box',
            kind: 'eksempel',
            x: ['Avgiftsgrunnlag 3 000 000 kr gir dokumentavgift på 75 000 kr. I tillegg kommer tinglysingsgebyr. Flere dokumenter kan gi flere gebyrer.'],
          },
          {
            t: 'p',
            x: 'Dokumentavgift er særlig viktig i flipping fordi kostnaden oppstår ved kjøpet og ikke øker boligens markedsverdi tilsvarende. Den må dekkes av marginen før noe annet har skjedd.',
          },
          {
            t: 'more',
            title: 'Vil du vite mer? Hva du bør undersøke i sameiet',
            blocks: [
              {
                t: 'p',
                x: 'Ved selveier er sameiets vedtekter, felleskostnader, eventuelle felleslån, årsregnskap, budsjett, vedlikeholdsplan og protokoller viktige. Se også etter varslede prosjekter og regler for inngrep i konstruksjon og fellesinstallasjoner. Dette utdypes i modul 3.',
              },
            ],
          },
        ],
      },
      {
        id: '2.3',
        title: 'Borettslag, andel og fellesgjeld',
        blocks: [
          {
            t: 'p',
            x: 'I et {{borettslag|borettslag}} kjøper du en andel som gir bruksrett til en bestemt bolig. Det beregnes normalt ikke dokumentavgift som ved overføring av selveier. Det betales registrerings- eller tinglysingsgebyr.',
          },
          {
            t: 'p',
            x: '{{fellesgjeld|Fellesgjeld}} er gjeld som borettslaget eller sameiet har tatt opp, ofte for bygging eller større vedlikeholdsprosjekter. Renter og avdrag betales normalt gjennom felleskostnadene.',
          },
          {
            t: 'box',
            kind: 'eksempel',
            x: ['Kontantpris: 2 200 000 kr. Fellesgjeld: 800 000 kr.', 'Gjeldsinkludert pris: **3 000 000 kr**.'],
          },
          { t: 'lead', x: 'En bolig til 2,2 millioner er ikke nødvendigvis en «2,2-millioners bolig».' },
          {
            t: 'p',
            x: 'Du skal derfor ikke sammenligne en borettslagsleilighet med 2,2 millioner i kontantpris direkte med en selveier til 2,8 millioner uten å forstå gjelden. Se også på felleskostnadene, renter og avdrag på fellesgjelden, en eventuell {{in|IN-ordning}}, avdragsfrihet, renteendringer og om nytt låneopptak er varslet.',
          },
          {
            t: 'p',
            x: 'Borettslag kan ha {{forkjopsrett|forkjøpsrett}}. Den kan påvirke gjennomføringen etter budaksept, og hovedfristen etter de ordinære reglene kan være 20 dager fra borettslaget har mottatt skriftlig melding. Gjennomføringen varierer, så sjekk vedtekter og prosedyre hos det konkrete boligbyggelaget eller forretningsføreren.',
          },
          {
            t: 'more',
            title: 'Vil du vite mer? Dette bør du spørre om fellesgjelden',
            blocks: [
              {
                t: 'p',
                x: 'Spør om saldo, rente, om renten er fast eller flytende, avdragsprofil, avdragsfri periode og når rentebinding eller avdragsfrihet slutter. Spør om den månedlige effekten, planlagt nytt låneopptak, om det finnes IN-ordning eller sikringsordning, og hva lånet finansierte.',
              },
            ],
          },
        ],
      },
      {
        id: '2.4',
        title: 'Aksjeleilighet, hus og tomannsbolig',
        blocks: [
          { t: 'h', x: 'Aksjeleilighet' },
          {
            t: 'p',
            x: 'Ved en {{aksjeleilighet|aksjeleilighet}} kjøper du aksjer som er knyttet til bruksrett til en bolig, mens selskapet normalt eier eiendommen. Du må derfor undersøke selskapsstruktur, vedtekter, aksjebok, rettigheter, overdragelsesregler og finansierbarhet ekstra nøye.',
          },
          { t: 'h', x: 'Hus' },
          {
            t: 'p',
            x: 'I en leilighet ligger en del større bygningsrisiko ofte i fellesskapet. I et hus er langt mer av den tekniske risikoen direkte din. Tak, drenering, grunnmur, fasade, avløp, vannledning, terreng, kjeller og fundamenter hører alle til din risiko. En enkelt overraskelse kan koste flere hundre tusen kroner.',
          },
          { t: 'h', x: 'Tomannsbolig' },
          {
            t: 'p',
            x: 'I en tomannsbolig må du i tillegg forstå eierform, fellesareal og eventuelle sameieforhold, hva som er godkjent bruk og om eventuelle utleiedeler faktisk er godkjente. Ikke legg inn verdi som om boligen har to lovlige boenheter uten dokumentasjon.',
          },
          {
            t: 'more',
            title: 'Vil du vite mer? «Stor tomt med utviklingsmuligheter»',
            blocks: [
              {
                t: 'p',
                x: 'Utviklingsmuligheter på tomten er en mulighet, ikke sikker verdi. Før du priser potensialet må regulering, byggegrenser, utnyttelsesgrad, adkomst, vann og avløp, servitutter og grunnforhold undersøkes.',
              },
            ],
          },
          {
            t: 'box',
            kind: 'husk',
            x: ['Eierformen avgjør hva du kjøper, hvilke kostnader du får og hvilken risiko som er din.'],
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'k2-1',
        question: 'En borettslagsleilighet har kontantpris 2,2 mill. og fellesgjeld 800 000. Hva er den største feilen du kan gjøre?',
        options: ['Se på felleskostnadene', 'Sammenligne 2,2 mill. direkte med en selveier til 2,8 mill.', 'Undersøke renten på fellesgjelden'],
        correct: 1,
        explain: 'Kontantprisen alene sier lite. Gjeldsinkludert pris er 3,0 millioner, og den må sammenlignes med riktig prisgrunnlag.',
      },
      {
        id: 'k2-2',
        question: 'Hvilken boligtype har normalt ikke ordinær dokumentavgift ved bruktboligoverføring?',
        options: ['Selveier', 'Borettslagsandel', 'Enebolig på selveiertomt'],
        correct: 1,
        explain: 'Det beregnes normalt ikke dokumentavgift ved overføring av en borettslagsandel. Det betales registrerings- eller tinglysingsgebyr.',
      },
    ],
  },

  {
    id: '3',
    num: 3,
    title: 'Undersøk boligen før du regner',
    goal: 'Lære brukeren å avdekke problemer før han blir forelsket i prosjektet.',
    pages: [
      {
        id: '3.1',
        title: 'Dokumentene du skal åpne først',
        blocks: [
          {
            t: 'p',
            x: 'Fine bilder på FINN sier lite om økonomisk risiko. Før du regner på noe skal du åpne salgsoppgaven, egenerklæringen, tilstandsrapporten, godkjente tegninger og ferdigattest eller tilgjengelig byggesaksdokumentasjon. For leiligheter kommer vedtekter, regnskap og budsjett og protokoller fra sameie eller borettslag i tillegg.',
          },
          {
            t: 'p',
            x: 'Dokumentene kan fortelle at et «perfekt oppussingsobjekt» har ulovlig rombruk, manglende dokumentasjon, gammel membran eller et sameie som planlegger millionrehabilitering. Slike opplysninger finner du ikke i annonsen.',
          },
          {
            t: 'box',
            kind: 'tips',
            title: 'Før-bud-sjekkliste',
            x: ['Du kan når som helst åpne før-bud-sjekklisten, krysse av det du har kontrollert og skrive den ut.'],
          },
          { t: 'widget', id: 'beforeBid' },
        ],
      },
      {
        id: '3.2',
        title: 'Slik leser du egenerklæringen',
        blocks: [
          {
            t: 'p',
            x: 'Se særlig etter opplysninger om lekkasjer, fukt, bad, elektrisk arbeid, rør og forsikringssaker. Se også etter ord som egeninnsats, dugnad, utført av selger, ufaglært arbeid og ingen dokumentasjon, og etter tegn på skadedyr og drenering.',
          },
          { t: 'p', x: 'Lær deg en arbeidsmetode. Ikke bare spør:' },
          { t: 'quote', x: ['«Er dette et problem?»'] },
          { t: 'p', x: 'Spør i stedet:' },
          { t: 'lead', x: 'Kan dette bli en kostnad, forsinkelse eller salgsrisiko for mitt prosjekt?' },
          {
            t: 'p',
            x: 'Dersom selger opplyser at arbeid er gjort selv eller uten dokumentasjon, skal du ikke automatisk anta at det er dårlig. Men usikkerheten må prises inn, og den er aldri 0 kroner.',
          },
        ],
      },
      {
        id: '3.3',
        title: 'Tilstandsrapport og TG',
        blocks: [
          {
            t: 'p',
            x: 'En {{tilstandsrapport|tilstandsrapport}} er ikke en garanti for at boligen er feilfri. Den er et strukturert informasjonsgrunnlag basert på det den bygningssakkyndige har undersøkt, dokumentasjonen som finnes og standarden rapporten bygger på.',
          },
          {
            t: 'box',
            kind: 'regel',
            x: ['Fra 1. juli 2026 brukes **NS 3600:2025** for nye rapporter etter forskriften.'],
          },
          {
            t: 'cards',
            items: [
              { title: '{{tg0|TG0}} – ingen avvik', x: 'Tilnærmet ny bygningsdel, ingen relevante avvik og dokumentasjon på faglig god utførelse.' },
              { title: '{{tg1|TG1}} – mindre eller moderate avvik', x: 'Normal slitasje eller mindre avvik. Strakstiltak vurderes normalt ikke som nødvendig.' },
              {
                title: '{{tg2|TG2}} – vesentlige avvik',
                x: 'Kan bety feil utførelse, skade eller symptom, sterk slitasje, nedsatt funksjon, behov for tiltak i nær fremtid eller høy alder med økt risiko.',
              },
              {
                title: '{{tg3|TG3}} – store eller alvorlige avvik',
                x: 'Forhold som må forventes utbedret straks eller innen kort tid, eller alvorlig funksjonssvikt. Rapporten skal normalt ha et sjablonmessig kostnadsanslag.',
              },
              { title: '{{tgiu|TGIU}} – ikke undersøkt', x: 'Ikke undersøkt betyr ikke i orden.' },
            ],
          },
          { t: 'box', kind: 'flagg', x: ['TGIU er ikke det samme som «ingen problem».'] },
          {
            t: 'p',
            x: 'Ikke tell antall TG2 og TG3. En bolig med fem TG2 kan være en bedre flipp enn en bolig med én TG3. Les hvorfor graden er satt, og forsøk for hvert avvik å finne årsaken, konsekvensen, nødvendig tiltak, når tiltaket må gjøres og mulig kostnad.',
          },
          {
            t: 'p',
            x: 'Spør også om kostnaden er kjent eller bare grovt anslått, og hvem som har ansvaret for avviket: du eller fellesskapet.',
          },
        ],
      },
      {
        id: '3.4',
        title: 'Bad, el, vann og avløp',
        blocks: [
          {
            t: 'p',
            x: 'Disse områdene kan gi store avvik mellom «kosmetisk oppussing» og virkelig prosjektkostnad. Det er her et billig utseende ofte blir et dyrt prosjekt.',
          },
          { t: 'h', x: 'Bad' },
          { t: 'p', x: 'Se etter badets alder, membran, sluk, fall og dokumentasjon, om det har vært lekkasjer og hvordan ventilasjonen fungerer.' },
          { t: 'h', x: 'Elektrisk' },
          {
            t: 'box',
            kind: 'regel',
            x: [
              'Den bygningssakkyndige foretar ikke full elkontroll og skal etter dagens forskrift ikke sette ordinær tilstandsgrad på det elektriske anlegget. Fravær av ordinær TG betyr derfor ikke at anlegget er kontrollert og godkjent.',
            ],
          },
          {
            t: 'p',
            x: 'Se etter samsvarserklæringer, dokumentasjon på endringer, alder på skap og anlegg og kommentarer i rapporten. Endringer etter 1999, synlige tegn på varmgang og spørsmål om DLE-kontroll er også verdt å følge opp.',
          },
          { t: 'h', x: 'Vann og avløp' },
          { t: 'p', x: 'Se etter alder, materialtype, lekkasjer, fellesstammer og rehabiliteringsplaner.' },
        ],
      },
      {
        id: '3.5',
        title: 'Borettslaget og sameiet kan spise opp fortjenesten',
        blocks: [
          {
            t: 'box',
            kind: 'eksempel',
            x: [
              'Du kjøper en leilighet med god kalkyle. Etter kjøpet vedtas tak-, fasade- og rørrehabilitering. Din andel av ny fellesgjeld blir 300 000 kr.',
              'Det er ikke sikkert leilighetens salgspris samtidig øker med 300 000 kr.',
            ],
          },
          {
            t: 'p',
            x: 'Nødvendig vedlikehold kan **bevare verdi** uten å skape tilsvarende merverdi. En kjøper seks måneder senere er ikke nødvendigvis villig til å betale mer for leiligheten bare fordi blokken har fått nytt tak.',
          },
          {
            t: 'p',
            x: 'Derfor skal du lese protokollene fra de siste to–tre årene, styrets årsberetning, regnskapet, budsjettet, vedlikeholdsplanen og låneinformasjonen. Se etter formuleringer som «innhenter tilbud», «rehabilitering vurderes», «lånefinansiering», rør, tak, fasade, vinduer, balkonger og heis.',
          },
          {
            t: 'box',
            kind: 'avklares',
            title: 'Ansvaret mellom eier og fellesskap',
            x: [
              'Ansvaret må vurderes konkret etter lov, vedtekter og installasjon. Skriv aldri at «sluket alltid tilhører borettslaget». Etter hovedreglene ligger mye innvendig vedlikehold hos eieren, men felles rør, ledninger, kanaler og felles installasjoner kan være fellesskapets ansvar, og vedtektene kan regulere ansvarsdelingen nærmere.',
            ],
          },
          {
            t: 'more',
            title: 'Vil du vite mer? Spør styret før du rører noe',
            blocks: [
              {
                t: 'p',
                x: 'Før du rører sluk, stamme, felles avløp, ventilasjon, bærende vegg eller fasade bør du sende en skriftlig forespørsel til styret eller forretningsfører. Spør om tiltaket må godkjennes, hvem som har vedlikeholdsansvar for installasjonen, om det stilles krav til foretak, om rehabilitering er planlagt og om laget har egne tekniske retningslinjer.',
              },
            ],
          },
          {
            t: 'box',
            kind: 'flagg',
            x: ['Ikke bruk 300 000 kroner på nytt bad én måned før borettslaget skal åpne alle badene for stamme- eller slukrehabilitering.'],
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'k3-1',
        question: 'Hva betyr TGIU?',
        options: ['Ingen avvik', 'Ikke undersøkt', 'Godkjent for videre bruk', 'Ubetydelig avvik'],
        correct: 1,
        explain: 'TGIU betyr ikke undersøkt. Det er ikke det samme som «ingen problem».',
      },
      {
        id: 'k3-2',
        question: 'Borettslaget planlegger et stort takprosjekt, men kostnaden er ikke bestemt. Hva skal du føre i analysen?',
        options: ['0 kr', 'Uavklart risiko', 'Ingenting før vedtaket er fattet'],
        correct: 1,
        explain: 'Ukjent betyr aldri 0 kroner. Forholdet må avklares eller modelleres som risiko.',
      },
      {
        id: 'k3-3',
        question: 'En bolig har fem TG2. Betyr det automatisk at den er et dårligere kjøp enn en bolig med én TG3?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Du må forstå årsak, konsekvens og kostnad bak hver tilstandsgrad.',
      },
    ],
  },
];
