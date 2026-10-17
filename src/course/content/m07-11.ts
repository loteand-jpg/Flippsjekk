import type { CourseModule } from '../types';

export const M7_11: CourseModule[] = [
  {
    id: '7',
    num: 7,
    title: 'Skatt når du flipper privat',
    goal: 'Skatt kommer nå på riktig tidspunkt: brukeren har forstått prosjektet og kostnadene og kan forstå hvordan skatt påvirker resultatet.',
    pages: [
      {
        id: '7.1',
        title: 'Er gevinsten skattefri eller skattepliktig?',
        blocks: [
          {
            t: 'box',
            kind: 'avklares',
            title: 'Viktig om skatt',
            x: ['Dette kurset gir generell opplæring. Skatt avgjøres av den konkrete situasjonen. Ved betydelige beløp eller gjentatt flipping bør du avklare behandlingen med Skatteetaten, regnskapsfører eller skatterådgiver.'],
          },
          {
            t: 'p',
            x: 'Gevinst ved salg av fast eiendom er i utgangspunktet skattepliktig. For egen bolig finnes et viktig unntak.',
          },
          {
            t: 'box',
            kind: 'regel',
            title: 'Gjeldende hovedregel per 17. oktober 2026',
            x: ['For skattefritt salg av egen bolig må vilkårene for både eiertid og botid være oppfylt.'],
            list: [
              '**Eiertid:** Salget må skje eller avtales mer enn ett år etter ervervet.',
              '**Botid:** Eieren må ha brukt boligen som egen bolig i minst 12 måneder i løpet av de siste 24 månedene før realisasjonen.',
            ],
          },
          {
            t: 'p',
            x: 'Det holder altså ikke bare å eie boligen lenge nok. Botidskravet må også være oppfylt. Bindende avtale er sentral for realisasjonstidspunktet, så datoen du inngår bindende salgsavtale kan være viktigere enn overtakelsesdatoen.',
          },
          {
            t: 'box',
            kind: 'regel',
            title: 'Viktig konsekvens',
            x: ['Hvis gevinsten er skattefri etter disse reglene, er et tilsvarende tap normalt heller ikke fradragsberettiget.'],
          },
        ],
      },
      {
        id: '7.2',
        title: 'Slik beregnes en skattepliktig gevinst',
        blocks: [
          { t: 'formula', lines: ['Utgangsverdi', '– inngangsverdi'], result: '= gevinst eller tap' },
          {
            t: 'p',
            x: '{{utgangsverdi|Utgangsverdien}} tar utgangspunkt i salgssummen med relevante salgskostnader, for eksempel megler, markedsføring og oppgjør. {{inngangsverdi|Inngangsverdien}} bygger blant annet på kjøpesum, relevante kjøpskostnader og skattemessige påkostninger.',
          },
          {
            t: 'box',
            kind: 'regel',
            x: ['Alminnelig inntekt for personer beskattes med **22 %** i 2026.'],
          },
          {
            t: 'box',
            kind: 'avklares',
            title: 'Ikke trekk automatisk 22 %',
            x: [
              'Ikke trekk automatisk 22 % fra alle private flipper. Først må det avklares om gevinsten er skattefri, om den er skattepliktig som kapital eller om aktiviteten kan være virksomhet. Kalkulatoren i kurset viser derfor skatt som «Ikke avklart» til du selv velger en illustrasjon.',
            ],
          },
          {
            t: 'p',
            x: 'Renter på egen gjeld er som hovedregel fradragsberettiget når du selv er ansvarlig for gjelden. Rentefradraget er et eget skattespørsmål og skal ikke blandes sammen med hvilke oppussingskostnader som kan legges til boligens skattemessige inngangsverdi.',
          },
        ],
      },
      {
        id: '7.3',
        title: 'Vedlikehold eller påkostning?',
        blocks: [
          {
            t: 'compare',
            a: {
              title: 'Vedlikehold',
              x: 'Arbeid som bringer boligen tilbake til tidligere standard.',
              list: ['Maling', 'Utskifting med omtrent tilsvarende standard', 'Reparasjon'],
            },
            b: {
              title: 'Påkostning',
              x: 'Arbeid som forbedrer boligen utover tidligere standard eller endrer den.',
              list: ['Endret planløsning', 'Reell standardheving', 'Nye funksjoner', 'Tilbygg', 'Utvidelse av tekniske anlegg'],
            },
          },
          {
            t: 'p',
            x: 'Én faktura kan inneholde begge deler. Hvis et gammelt standardkjøkken erstattes med et betydelig bedre kjøkken, er ikke nødvendigvis hele kostnaden påkostning. En del kan økonomisk være utskifting og en del standardheving. Ikke lær at alt du pusser opp gir fradrag.',
          },
          {
            t: 'box',
            kind: 'forklart',
            x: ['100 000 kroner i skattemessig inngangsverdi er ikke det samme som å få 100 000 kroner tilbake. Du har fortsatt brukt pengene.'],
          },
          { t: 'widget', id: 'paakostning' },
        ],
      },
      {
        id: '7.4',
        title: 'Dokumentasjon og eget arbeid',
        blocks: [
          {
            t: 'p',
            x: 'Lær å dokumentere underveis. Ta vare på faktura, kvitteringer, før- og etter-bilder, beskrivelser, samsvarserklæringer, håndverkerinformasjon, timer og hva som faktisk ble forbedret. Den beste tiden å dokumentere en påkostning er mens arbeidet pågår, ikke to år senere når du prøver å huske hva som lå bak én samlet faktura på 187 430 kroner.',
          },
          { t: 'widget', id: 'docChecklist' },
          {
            t: 'p',
            x: 'Verdien av eget arbeid kan i enkelte tilfeller få betydning for inngangsverdien når arbeidet gjelder påkostning, men det betyr ikke at du bare kan legge egen timepris inn som et automatisk skattefradrag. Skattemessig behandling avhenger blant annet av hva slags arbeid som er gjort og hvordan boligen har vært brukt.',
          },
          {
            t: 'box',
            kind: 'forklart',
            title: 'To ulike ting',
            x: ['Skill mellom den økonomiske verdien av tiden i prosjektkalkylen og den skattemessige behandlingen av eget arbeid. Kurset verdsetter egen tid separat, og legger ikke inn noen automatisk skattefordel for den.'],
          },
        ],
      },
      {
        id: '7.5',
        title: 'Når privat flipping kan bli virksomhet',
        blocks: [
          { t: 'lead', x: 'Det finnes ikke en enkel regel om at «X antall flipper = virksomhet».' },
          {
            t: 'p',
            x: 'Det foretas en helhetsvurdering. Momentene er blant annet om aktiviteten er egnet til overskudd, drives for skattyters regning og risiko, har en viss varighet og har et visst omfang. Aktivitet utført gjennom andre, for eksempel innleide håndverkere, kan også ha betydning.',
          },
          {
            t: 'box',
            kind: 'flagg',
            x: ['Hvis du systematisk kjøper, utvikler, pusser opp og selger eiendommer med fortjenesteformål, kan skattebehandlingen bli en annen enn for et enkelt privat salg.'],
          },
          {
            t: 'p',
            x: 'Dette er spesielt relevant for en person som systematisk kjøper, utvikler og videreselger eiendom. Jo mer profesjonelt og gjentakende opplegget blir, desto viktigere er det å avklare virksomhetsgrensen før du baserer hele investeringsstrategien på vanlig privat kapitalbeskatning eller skattefritaket for egen bolig. Dersom aktiviteten blir virksomhet, kan det oppstå ytterligere skatte- og avgiftsspørsmål. Dette behandles i det senere kurset «Flipping gjennom AS».',
          },
          {
            t: 'box',
            kind: 'radar',
            title: 'Dette er et forslag – ikke dagens regel',
            x: [
              'Torvik-utvalget (NOU 2022:20) har foreslått endringer i boligbeskatningen, blant annet en modell der botid får forholdsmessig betydning over en lengre periode, begrenset til de siste fem årene av eiertiden. Etter forslaget kunne 4/5 av gevinsten bli skattepliktig for en bolig som er eid i fem år og utleid i fire.',
              'Dagens kursregler er eier- og botidsreglene beskrevet på side 7.1. Skill alltid mellom et skattefaglig forslag og vedtatt lov.',
            ],
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'k7-1',
        question: 'Du har eid boligen i 13 måneder, men bodd der bare fire måneder. Er gevinsten automatisk skattefri?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Både eiertid og botid må være oppfylt. Botid er minst 12 måneder de siste 24 månedene før realisasjonen.',
      },
      {
        id: 'k7-2',
        question: 'Er hele kostnaden til et nytt kjøkken automatisk skattemessig påkostning?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Én faktura kan inneholde både vedlikehold og påkostning. Bare standardhevingen kan være påkostning.',
      },
      {
        id: 'k7-3',
        question: 'Hvor mange boligflipper kan du gjøre før aktiviteten automatisk blir virksomhet?',
        options: ['1', '2', '3', 'Det finnes ingen slik fast tallgrense'],
        correct: 3,
        explain: 'Det foretas en helhetsvurdering av blant annet overskuddsformål, risiko, varighet og omfang.',
      },
    ],
  },

  {
    id: '8',
    num: 8,
    title: 'Lønnsomhet, risiko og maksbud',
    goal: 'Samle økonomien som tidligere lå spredt over flere moduler. Dette er kursets økonomiske hovedmodul.',
    pages: [
      {
        id: '8.1',
        title: 'Flippkalkulatoren',
        blocks: [
          {
            t: 'p',
            x: 'Kalkulatoren bruker samme beregningsmotor som resten av Flippsjekk. Tallene du fyller inn er dine forutsetninger. Et tomt felt betyr uavklart, ikke 0 kroner, og gir en ufullstendig kalkyle med navngitte mangler.',
          },
          { t: 'widget', id: 'calculator' },
          {
            t: 'box',
            kind: 'forklart',
            title: 'Slik regner modellen',
            list: [
              'Kjøpskostnader **K = A × d + F**',
              'Oppussing med reserve **RB = R × (1 + b)**',
              'Prosjektlånsrenter **I = f × ((P + K) + RB/2) × r × m/12**. Modellen antar forenklet at oppussingsmidlene i snitt bindes halvveis gjennom prosjektet.',
              'Drift **O = M × m**',
              'Ved totalpris er kontantsalget **S = V − D1**. Ved kontantpris er **S = V**.',
              'Salgskostnader **Csale = Sf + s × S**, og samlede kostnader **C = P + K + RB + I + O + Csale**',
              'Resultat før skatt og egen tid **= S − C**, og etter verdsatt egeninnsats **= S − C − H × h**',
              'Prosjektavkastning **= (S − C) / (C + D0)**',
            ],
          },
        ],
      },
      {
        id: '8.2',
        title: 'Lav, base og høy',
        blocks: [
          {
            t: 'cards',
            items: [
              { title: 'Lav', x: 'Et realistisk dårlig utfall.' },
              { title: 'Base', x: 'Det best begrunnede normalutfallet basert på informasjonen i dag.' },
              { title: 'Høy', x: 'Et godt, men fremdeles plausibelt utfall.' },
            ],
          },
          {
            t: 'p',
            x: 'Ikke gjør «høy» til fantasi. Uten ønsketenkning, udokumentert markedsvekst og verdi av et ulovlig eller uavklart ekstra soverom skal alle tre utfallene tåle at du forklarer dem. Her er resultatet for alle tre i din kalkyle:',
          },
          { t: 'widget', id: 'scenarios' },
        ],
      },
      {
        id: '8.3',
        title: 'Stresstest',
        blocks: [
          {
            t: 'p',
            x: 'En stresstest endrer én forutsetning, eller en kombinasjon, og regner hele kalkylen på nytt. Trykk på en test og se hva som skjer med resultatet.',
          },
          { t: 'widget', id: 'stress' },
          {
            t: 'p',
            x: 'Hvis en nedgang på 5 % gjør et prosjekt katastrofalt, var prosjektets margin liten allerede før problemet oppstod.',
          },
        ],
      },
      {
        id: '8.4',
        title: 'Avkastning og timelønn',
        blocks: [
          {
            t: 'p',
            x: 'Se på tre tall samtidig: resultat før skatt og egen tid, resultat etter verdsatt egen tid og prosjektavkastning. Prosjektavkastning er ikke det samme som egenkapitalavkastning.',
          },
          { t: 'widget', id: 'returns' },
          {
            t: 'box',
            kind: 'eksempel',
            title: 'Eksempel – ikke fasit',
            x: ['Eksempelinnstillinger kan være 400 000 kr fortjenestemål, 15–20 % prosjektavkastning og 350 kr/time. Du setter dine egne krav.'],
          },
        ],
      },
      {
        id: '8.5',
        title: 'Regn baklengs til maksbud',
        blocks: [
          { t: 'p', x: 'Dette er et av kursets viktigste læringspunkter. Ikke spør:' },
          { t: 'quote', x: ['«Hvor mye tror jeg boligen går for?»'] },
          { t: 'p', x: 'Spør i stedet:' },
          { t: 'lead', x: 'Hva kan jeg betale og fortsatt få resultatet jeg krever?' },
          {
            t: 'p',
            x: 'Velg et resultatkrav i kalkulatoren under og se modellert maks kjøpspris i lavt, normalt og høyt scenario. Kjøpsavgift og renter beregnes på nytt for hver pris.',
          },
          { t: 'widget', id: 'maxbud' },
          {
            t: 'box',
            kind: 'husk',
            x: ['Maksbudet bestemmes av kalkylen før budrunden. Et modellert maksbud er ikke en budfullmakt eller garanti.'],
          },
          { t: 'widget', id: 'beforeBid' },
        ],
      },
      {
        id: '8.6',
        title: 'Tre eksempelobjekter',
        blocks: [
          { t: 'p', x: 'Eksempelobjektene hører hjemme her og er alle fiktive.' },
          { t: 'h', x: 'Case A – Den falske 500 000-kronersmarginen' },
          { t: 'widget', id: 'caseA' },
          { t: 'h', x: 'Case B – Billig borettslagsleilighet?' },
          { t: 'widget', id: 'caseB' },
          { t: 'h', x: 'Case C – Huset med den dyre grunnmuren' },
          { t: 'widget', id: 'caseC' },
        ],
      },
    ],
    quiz: [
      {
        id: 'k8-1',
        question: 'Hva bør avgjøre maksbudet ditt?',
        options: ['Hvor mye neste budgiver byr', 'Hvor høyt banken lar deg gå', 'Prosjektkalkylen og resultatkravet ditt', 'Prisantydningen'],
        correct: 2,
        explain: 'Maksbudet er et resultat av kalkylen, ikke av konkurranseinstinktet.',
      },
      {
        id: 'k8-2',
        question: 'Et prosjekt er lønnsomt bare i høyt scenario. Hva er den beste konklusjonen?',
        options: ['Prosjektet er trygt', 'Prosjektet har svak sikkerhetsmargin', 'Høyt scenario bør gjøres til base'],
        correct: 1,
        explain: 'Et prosjekt som bare fungerer i høyt scenario har liten margin og tåler lite.',
      },
      {
        id: 'k8-3',
        question: 'Hva betyr «ukjent» i en kalkyle?',
        options: ['0 kroner', 'Gratis', 'At forholdet må avklares eller modelleres som risiko'],
        correct: 2,
        explain: 'Ukjent betyr aldri 0 kroner.',
      },
    ],
  },

  {
    id: '9',
    num: 9,
    title: 'Visning, bud og kjøp',
    goal: 'Nå kan brukeren endelig gå fra analyse til kjøp.',
    pages: [
      {
        id: '9.1',
        title: 'Før og under visning',
        blocks: [
          {
            t: 'p',
            x: 'Før visningen skal du ha en foreløpig salgsverdi, en foreløpig oppussingsplan, de dokumenterte hovedrisikoene, spørsmål til megler og et første budsjett. Da kan du bruke visningen til det den er best til.',
          },
          {
            t: 'p',
            x: 'På visning skal du ikke bare se etter fine detaljer. Se etter det analysen ikke kan vise godt: lukt og fukttegn, støy, lys og utsikt, gulv og skjevheter, plass, tekniske føringer og kvaliteten på utførelsen. Ta bilder og skriv egne notater.',
          },
          { t: 'widget', id: 'beforeBid' },
        ],
      },
      {
        id: '9.2',
        title: 'Bud og akseptfrist',
        blocks: [
          {
            t: 'p',
            x: 'Et bud inneholder beløp, {{akseptfrist|akseptfrist}}, overtakelse og eventuelle forbehold. Bud og budforhøyelser gjennom megler skal være skriftlige.',
          },
          {
            t: 'box',
            kind: 'regel',
            title: 'Hovedregel i forbrukerforhold',
            x: ['Megler kan ikke formidle bud med akseptfrist kortere enn til **kl. 12.00 første virkedag etter siste annonserte visning**.'],
          },
          {
            t: 'box',
            kind: 'forklart',
            x: ['Dette betyr ikke at du først kan gi bud kl. 12. Regelen gjelder hvilken akseptfrist megler kan formidle, ikke når du kan gi budet.'],
          },
          {
            t: 'box',
            kind: 'eksempel',
            x: [
              'Siste annonserte visning er søndag. Et bud kan sendes søndag kveld.',
              'Men dersom mandag er første virkedag, kan megler etter hovedregelen ikke formidle et bud med akseptfrist tidligere enn kl. 12 mandag. Lørdager regnes ikke som virkedag i denne sammenhengen.',
            ],
          },
          {
            t: 'box',
            kind: 'avklares',
            x: ['Ved helligdager og spesielle datoer må du kontrollere den konkrete fristen med megler. Kalenderens «Forventet buddag» i Flippsjekk er en planleggingsprognose, ikke en bekreftet frist.'],
          },
        ],
      },
      {
        id: '9.3',
        title: 'Kuppbud',
        blocks: [
          {
            t: 'p',
            x: 'Et {{kuppbud|kuppbud}} forsøker typisk å få selger til å akseptere før den ordinære budkonkurransen. Tidlig tilgang til boligen er ikke en gevinst dersom du betaler mer enn kalkylen tåler.',
          },
          {
            t: 'p',
            x: 'Megler skal oppfordre selger til ikke å omgå minste akseptfrist gjennom direkte tidlige bud. Hemmelige bud gjennom megler ble forbudt fra 1. juli 2025.',
          },
          {
            t: 'p',
            x: 'Kupping er ikke et smart standardtriks. Det er en situasjon der kjøper lett kan bli presset til å ta beslutningen før informasjonen er god nok, og før du har sett dokumentene, visningen og markedet.',
          },
          {
            t: 'box',
            kind: 'tips',
            x: ['For en flipper er «å få boligen før alle andre» verdiløst dersom du samtidig betaler 150 000 kroner for mye eller overser et bad til 300 000 kroner.'],
          },
        ],
      },
      {
        id: '9.4',
        title: 'Budstrategien',
        blocks: [
          { t: 'p', x: 'Før første bud skal du skrive ned:' },
          { t: 'lead', x: 'Mitt maksbud: ______' },
          {
            t: 'p',
            x: 'Tallet skal ikke flyttes fordi du allerede har brukt mye tid på objektet, fordi andre byr aggressivt, fordi du «bare» må opp 10 000 til eller fordi megler sier at interessen er stor. Maksbudet kan bare endres dersom fakta endres. Hvis ny dokumentasjon viser at badet likevel er nytt og korrekt dokumentert, kan kalkylen endres. Konkurranseinstinktet alene er ikke ny informasjon.',
          },
          {
            t: 'p',
            x: 'Selger er normalt ikke forpliktet til å velge høyeste bud. Forbehold, finansiering og overtakelse kan påvirke valget, og det er ikke en grunn til å fjerne nødvendige forbehold.',
          },
          { t: 'box', kind: 'flagg', x: ['Det er ikke angrerett ved et bindende boligkjøp. Når avtale er inngått kan du ikke ombestemme deg fordi prosjektet viser seg mindre lønnsomt.'] },
        ],
      },
    ],
    quiz: [
      {
        id: 'k9-1',
        question: 'Kan du sende bud før kl. 12 første virkedag etter siste visning?',
        options: ['Nei', 'Ja'],
        correct: 1,
        explain: 'Regelen gjelder hvilken akseptfrist megler kan formidle, ikke når budet kan gis.',
      },
      {
        id: 'k9-2',
        question: 'Hva skal normalt få deg til å øke maksbudet?',
        options: ['At en annen budgiver byr mer', 'Nye fakta som forbedrer kalkylen', 'At megler ringer mange ganger'],
        correct: 1,
        explain: 'Konkurranseinstinktet alene er ikke ny informasjon.',
      },
      {
        id: 'k9-3',
        question: 'Må selger akseptere høyeste bud?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Selger står normalt fritt til å velge. Forbehold, finansiering og overtakelse kan ha betydning.',
      },
    ],
  },

  {
    id: '10',
    num: 10,
    title: 'Gjennomfør oppussingen',
    goal: 'Nå går vi fra analyse til prosjektledelse.',
    pages: [
      {
        id: '10.1',
        title: 'Planlegg før du river',
        blocks: [
          {
            t: 'p',
            x: 'Riktig rekkefølge sparer tid og penger. Før arbeidet starter bør du måle opp, avklare planløsning og tekniske løsninger, bestille kritiske varer, booke håndverkere, avklare med styret eller sameiet der det er nødvendig og lage en fremdriftsplan.',
          },
          {
            t: 'p',
            x: 'Dårlig koordinering koster penger. En typisk rekkefølge er rørlegger, tømrer, elektriker, membran, flis, kjøkken og finish, men den avhenger av prosjektet.',
          },
          { t: 'lead', x: 'Riving er ikke prosjektstart. Planlegging er prosjektstart.' },
        ],
      },
      {
        id: '10.2',
        title: 'Hva kan du gjøre selv?',
        blocks: [
          {
            t: 'p',
            x: 'Egeninnsats kan være et konkurransefortrinn. En kompetent privatperson kan vurdere å gjøre riving når det er trygt, bæring, avfall, maling, gulv, listing, kjøkkenmontering, enklere snekkerarbeid, logistikk og rengjøring.',
          },
          {
            t: 'p',
            x: 'Men det som er lov å gjøre selv er ikke nødvendigvis lønnsomt å gjøre selv. Dårlig utførelse kan redusere salgsprisen, gi ny kjøper usikkerhet, skape reklamasjon og føre til at fagfolk må gjøre jobben på nytt.',
          },
          { t: 'widget', id: 'selfSave' },
        ],
      },
      {
        id: '10.3',
        title: 'Elektrisk og rør',
        blocks: [
          { t: 'h', x: 'Elektrisk' },
          {
            t: 'box',
            kind: 'regel',
            x: [
              'Bare begrensede enkle elektriske arbeider kan utføres av ufaglærte. Fastmonterte varmekabler og ordinære endringer i den faste elektriske installasjonen skal ikke gjøres av ufaglærte, heller ikke ved at du monterer dem og elektrikeren bare kobler dem til.',
              'Arbeid som krever elektrovirksomhet skal utføres av riktig registrert virksomhet, og relevant dokumentasjon og {{samsvarserklaering|samsvarserklæring}} skal tas vare på.',
            ],
          },
          {
            t: 'box',
            kind: 'tips',
            x: ['Spar heller penger ved å planlegge el-punktene godt, åpne vegger og rive etter avtale og koordinere arbeidene. Ikke ved ulovlig elarbeid.'],
          },
          { t: 'h', x: 'Vann og rør' },
          {
            t: 'p',
            x: 'Ved flipping bør arbeid på kritiske vanninstallasjoner, pressuriserte rør og endringer med betydelig lekkasjerisiko overlates til kvalifisert rørlegger. Dokumentasjon, ansvar og senere salg er viktige deler av vurderingen. Direktoratet for byggkvalitet anbefaler at rørlegger brukes til vannrør og koblinger, og lokale abonnementsvilkår og konkrete installasjoner kan også stille krav.',
          },
        ],
      },
      {
        id: '10.4',
        title: 'Badet',
        blocks: [
          {
            t: 'p',
            x: 'Skill mellom {{tek17|TEK17}} og forskriftskrav på den ene siden og bransjenorm eller god praksis på den andre. En bransjenorm som Byggebransjens våtromsnorm er ikke automatisk identisk med lovkrav i hvert punkt, og en {{preakseptert|preakseptert løsning}} er en dokumentert måte å oppfylle kravet på.',
          },
          {
            t: 'p',
            x: 'Våtrom skal blant annet ha løsninger for sluk, tilstrekkelig fall, håndtering av lekkasjevann, vanntett sjikt, tette gjennomføringer og ventilasjon. Ikke lær én enkelt fallverdi som «hele loven». TEK17 har flere preaksepterte løsninger, blant annet 1:50 i relevante dusjsoner eller 1:100-løsninger avhengig av utførelse.',
          },
          {
            t: 'compare',
            a: {
              title: 'Egeninnsats etter avtale',
              x: 'Demontering av innredning, forsiktig riving, avfall, innkjøp, logistikk, maling utenfor kritiske våtsoner og montering av løst inventar der det er forsvarlig.',
            },
            b: {
              title: 'Profesjonell jobb',
              x: 'Fast elektrisk installasjon, varmekabler, kritisk rørarbeid, sluk og rørendringer, membran og tettesystem du ikke selv kan dokumentere og stå for, og arbeid der borettslag eller sameie krever kvalifisert foretak.',
            },
          },
          {
            t: 'box',
            kind: 'flagg',
            title: 'Avklar grensesnittet',
            x: ['Dersom du ønsker å gjøre deler selv, avklar grensesnittet med entreprenør før prosjektstart. Ikke riv eller bygg noe som gjør at elektrikeren, rørleggeren eller membranleggeren senere nekter å ta ansvar for løsningen.'],
          },
        ],
      },
      {
        id: '10.5',
        title: 'Spar penger uten å spare bort kvaliteten',
        blocks: [
          {
            t: 'p',
            x: 'Gode sparetiltak er å standardisere materialer, bruke få leverandører, handle planlagt og sammenligne tilbud. Skriv samme arbeidsbeskrivelse til alle tilbydere, med lik prosjektbeskrivelse, to–tre tilbud og samme omfang, og sammenlign hva som ikke er inkludert. Laveste pris er ikke alltid billigst.',
          },
          {
            t: 'p',
            x: 'Handle tidlig: materialkampanjer, outlet, standardvarer og pent brukt der det passer, og unngå ekspressbestillinger. Men ikke kjøp dyre spesialvarer før prosjektet er endelig målsatt. Koordiner fagene og gjør lønnsom egeninnsats, og unngå tekniske flyttinger som ikke skaper nok verdi.',
          },
          {
            t: 'box',
            kind: 'husk',
            x: ['Den største besparelsen er ofte et bedre kjøp – ikke billigere fugemasse. 50–200 000 kr lavere kjøpspris slår 4 000 kr spart på maling.'],
          },
        ],
      },
      {
        id: '10.6',
        title: 'Dokumentasjon er en del av boligen',
        blocks: [
          {
            t: 'p',
            x: 'Dokumenter før-bilder, underveisbilder og skjulte konstruksjoner, og ta vare på faktura, kvitteringer, produkter, fagfolk, samsvarserklæringer, våtromsdokumentasjon, FDV, tegninger og godkjenninger. Dokumentasjonen er en del av produktet du senere skal selge.',
          },
          {
            t: 'p',
            x: 'Den har verdi skattemessig, ved senere salg, ved reklamasjon og for kjøpers trygghet. Bilder av sluk og membran-overgang, rørføringer og andre skjulte lag kan ikke tas etterpå.',
          },
          { t: 'lead', x: 'Ikke vent til salgsuken med å forsøke å rekonstruere hva som ble gjort.' },
          { t: 'widget', id: 'docChecklist' },
        ],
      },
    ],
    quiz: [
      {
        id: 'k10-1',
        question: 'Kan en ufaglært person legge fastmonterte varmekabler og få elektrikeren til å «bare koble dem til»?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Fastmonterte varmekabler og ordinære endringer i fast elektrisk installasjon skal ikke gjøres av ufaglærte.',
      },
      {
        id: 'k10-2',
        question: 'Hva er den beste tiden å dokumentere arbeid som senere bygges inn?',
        options: ['Etter salget', 'Mens arbeidet utføres', 'Når kjøper spør'],
        correct: 1,
        explain: 'Skjulte lag kan ikke dokumenteres etterpå.',
      },
      {
        id: 'k10-3',
        question: 'Er en bransjenorm alltid identisk med lovens minimumskrav?',
        options: ['Ja', 'Nei'],
        correct: 1,
        explain: 'Bransjenorm er god praksis og ikke automatisk lovkrav i hvert punkt.',
      },
    ],
  },

  {
    id: '11',
    num: 11,
    title: 'Selg og avslutt prosjektet',
    goal: 'Ferdigstille hele kjøp–oppussing–salg-løpet.',
    pages: [
      {
        id: '11.1',
        title: 'Salgsarbeidet starter under oppussingen',
        blocks: [
          {
            t: 'p',
            x: 'Et godt salg forberedes under hele prosjektet. Når boligen er ferdig bør du allerede ha dokumentasjon, fakturaer, plantegninger, håndverkerinformasjon, samsvarserklæringer, bilder av skjulte arbeider og en oversikt over tiltakene.',
          },
          {
            t: 'p',
            x: 'Ikke bruk de siste dagene før annonsering til å lete etter papirer. Det gir stress, hull i dokumentasjonen og et dårligere inntrykk for kjøperne.',
          },
        ],
      },
      {
        id: '11.2',
        title: 'Velg megler og presentasjon',
        blocks: [
          {
            t: 'p',
            x: 'Snakk med flere meglere som faktisk kjenner markedet. Vurder relevante salg, lokalkunnskap, prisvurdering, markedsplan, kommunikasjon og total pris. Ikke velg automatisk den med høyest prisestimat. En optimistisk verdivurdering kan vinne oppdraget uten å gi høyere faktisk salgspris.',
          },
          {
            t: 'p',
            x: 'Avslutt boligen godt: reparer småfeil, ferdigstill lister, rydd og vask og sørg for god belysning. Vurder profesjonelt foto, og bruk styling der det økonomisk gir mening.',
          },
          {
            t: 'box',
            kind: 'flagg',
            title: 'Ikke overoppuss',
            x: ['En leilighet til en målgruppe med maksimal betalingsvilje på 4 millioner blir ikke nødvendigvis verdt 4,5 millioner fordi du installerer et kjøkken til 400 000. Oppuss til markedet.'],
          },
        ],
      },
      {
        id: '11.3',
        title: 'Opplysningsansvar og trygg dokumentasjon',
        blocks: [
          {
            t: 'p',
            x: 'En flipper kan ha bedre kunnskap om boligen enn en vanlig eier fordi han nettopp har åpnet vegger og gjennomført omfattende arbeid. Kjente relevante problemer skal ikke skjules. Du må opplyse om relevante kjente forhold, også de du oppdaget under oppussingen.',
          },
          {
            t: 'p',
            x: 'God dokumentasjon kan redusere usikkerheten, gjøre boligen enklere å forstå, redusere konflikt og gjøre kjøper tryggere. Det gir mindre risiko etter salg.',
          },
          { t: 'lead', x: 'Dokumentasjonen er ikke bare administrasjon. Den er en del av produktet.' },
        ],
      },
      {
        id: '11.4',
        title: 'Etterkalkyle: Ble prosjektet egentlig godt?',
        blocks: [
          {
            t: 'p',
            x: 'Etter salget skal du sammenligne det som var planlagt med det som faktisk skjedde. Sett opp kjøpspris, oppussing, reserve brukt, prosjektlengde, renter, drift, salgskostnad, salgspris, resultat, egne timer og faktisk resultat per time, side om side med kalkylen din.',
          },
          {
            t: 'p',
            x: 'En flipper lærer lite av bare å spørre om han tjente penger. Bedre spørsmål er hva du estimerte riktig, hva du bommet på, hvilke risikoer du burde sett tidligere og hva du skal gjøre annerledes neste gang.',
          },
          {
            t: 'box',
            kind: 'husk',
            title: 'Flippsjekks 7 spørsmål før bud',
            list: [
              'Hva kan boligen realistisk selges for i dagens marked?',
              'Hva må gjøres?',
              'Hva koster hele prosjektet?',
              'Hva vet jeg ikke?',
              'Hva skjer dersom ting går dårlig?',
              'Hva får jeg betalt for tiden og risikoen?',
              'Hva er mitt maksbud?',
            ],
            ordered: true,
          },
          {
            t: 'lead',
            x: 'En god investor tjener ikke bare penger på objektene han kjøper. Han unngår store tap på objektene han lar andre kjøpe.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'k11-1',
        question: 'Når bør du begynne å samle dokumentasjonen som skal brukes ved et senere salg?',
        options: ['Når megler bestilles', 'Under hele prosjektet', 'Etter første visning'],
        correct: 1,
        explain: 'Dokumentasjon samles under hele prosjektet. Ikke vent til salgsuken.',
      },
      {
        id: 'k11-2',
        question: 'Hva er viktigst i etterkalkylen?',
        options: ['Bare om prosjektet ga overskudd', 'Forskjellen mellom planlagt og faktisk resultat', 'Hvor mange bilder annonsen fikk'],
        correct: 1,
        explain: 'Du lærer mest av å forstå hva du estimerte riktig og hva du bommet på.',
      },
    ],
  },
];
