/** Ordliste. Alle definisjoner bygger på kursteksten – ingen egne regler. */
export interface GlossaryEntry {
  term: string;
  def: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  kontantpris: { term: 'Kontantpris', def: 'Prisen uten fellesgjeld. Skal ikke forveksles med totalpris.' },
  totalpris: { term: 'Totalpris (gjeldsinkludert pris)', def: 'Kontantpris pluss fellesgjeld, men uten kjøpskostnader. Annonsens eventuelle totalbeløp inkludert kjøpskostnader er noe annet.' },
  fellesgjeld: { term: 'Fellesgjeld', def: 'Gjeld som borettslaget eller sameiet har tatt opp, ofte for bygging eller større vedlikeholdsprosjekter. Renter og avdrag betales normalt gjennom felleskostnadene.' },
  felleskostnader: { term: 'Felleskostnader', def: 'Månedlige kostnader til borettslaget eller sameiet. Kan inneholde renter og avdrag på fellesgjeld.' },
  dokumentavgift: { term: 'Dokumentavgift', def: 'Avgift ved overføring av fast eiendom. Gjeldende hovedregel er 2,5 % av markedsverdien. Beregnes normalt ikke ved overføring av en borettslagsandel.' },
  tinglysing: { term: 'Tinglysingsgebyr', def: 'Gebyr for å registrere dokumenter i grunnboken. Flere dokumenter kan gi flere gebyrer.' },
  eierseksjon: { term: 'Eierseksjon (selveier)', def: 'Du eier selve seksjonen som fast eiendom, samtidig som du eier en andel av sameiets fellesarealer.' },
  borettslag: { term: 'Borettslag / andelsleilighet', def: 'Du kjøper en andel i borettslaget som gir bruksrett til en bestemt bolig.' },
  aksjeleilighet: { term: 'Aksjeleilighet', def: 'Et aksjeselskap eier normalt selve eiendommen, mens du kjøper aksjer som er knyttet til retten til å bruke en bestemt bolig.' },
  in: { term: 'IN-ordning', def: 'Individuell nedbetaling av fellesgjeld. Andelseieren kan normalt betale ned hele eller deler av sin andel og dermed redusere den delen av felleskostnadene som går til renter og avdrag.' },
  forkjopsrett: { term: 'Forkjøpsrett', def: 'En person med forkjøpsrett kan i gitte tilfeller tre inn i den inngåtte avtalen på de samme vilkårene.' },
  inngangsverdi: { term: 'Inngangsverdi', def: 'I utgangspunktet opprinnelig kjøpesum, relevante kjøpskostnader og senere skattemessige påkostninger.' },
  utgangsverdi: { term: 'Utgangsverdi', def: 'I prinsippet salgssummen redusert med relevante salgskostnader.' },
  eiertid: { term: 'Eiertid', def: 'Ett av to hovedvilkår for skattefritt salg av egen bolig: salget må skje eller avtales mer enn ett år etter at boligen ble ervervet.' },
  botid: { term: 'Botid', def: 'Det andre hovedvilkåret: eieren må ha brukt boligen som egen bolig i minst 12 måneder i løpet av de siste 24 månedene før realisasjonen.' },
  vedlikehold: { term: 'Vedlikehold', def: 'I hovedsak å sette boligen tilbake i den standarden den tidligere har hatt.' },
  paakostning: { term: 'Påkostning', def: 'Forbedring eller endring utover tidligere standard, for eksempel endret planløsning, nytt rom, flytting av bad eller standardheving.' },
  virksomhet: { term: 'Virksomhet (skatt)', def: 'Skattemyndighetene foretar en helhetsvurdering: er aktiviteten egnet til å gi overskudd, drives for din regning og risiko, har en viss varighet og et visst omfang.' },
  tilstandsrapport: { term: 'Tilstandsrapport', def: 'Et strukturert informasjonsgrunnlag basert på det den bygningssakkyndige har undersøkt, dokumentasjonen som finnes og forskriften/standarden rapporten bygger på. Ingen garanti for at boligen er feilfri.' },
  egenerklaering: { term: 'Egenerklæring', def: 'Selgers egne opplysninger om boligen. Les spesielt etter egeninnsats, dugnad, manglende dokumentasjon, tidligere lekkasjer og forsikringssaker.' },
  tg0: { term: 'TG0', def: 'Ingen avvik. Tilnærmet ny bygningsdel, ingen relevante avvik og dokumentasjon på faglig god utførelse.' },
  tg1: { term: 'TG1', def: 'Mindre avvik. Normal slitasje/mindre avvik. Strakstiltak vurderes normalt ikke som nødvendig.' },
  tg2: { term: 'TG2', def: 'Vesentlige avvik. Kan bety feil utførelse, skade eller symptom, sterk slitasje, nedsatt funksjon, behov for tiltak i nær fremtid eller høy alder med økt risiko.' },
  tg3: { term: 'TG3', def: 'Store eller alvorlige avvik som må forventes utbedret straks eller innen kort tid, eller alvorlig funksjonssvikt. Rapporten skal normalt ha et sjablonmessig kostnadsanslag.' },
  tgiu: { term: 'TGIU', def: 'Ikke undersøkt. Ikke undersøkt betyr ikke i orden.' },
  akseptfrist: { term: 'Akseptfrist', def: 'Tidsgrensen for når selgers aksept må nå deg for at avtalen skal bli inngått på grunnlag av budet.' },
  kuppbud: { term: 'Kuppbud', def: 'Brukes om å forsøke å kjøpe boligen før den ordinære budrunden, ofte med et direkte eller tidlig bud som skal være attraktivt nok til at selger aksepterer med en gang.' },
  reserve: { term: 'Reserve', def: 'Penger til forhold du ikke kjente til da du satte opp budsjettet – ikke penger til dyrere fliser.' },
  prosjektavkastning: { term: 'Prosjektavkastning', def: '(S − C) / (C + fellesgjeld ved kjøp). Dette er prosjektavkastning, ikke egenkapitalavkastning.' },
  maksbud: { term: 'Maksbud', def: 'Høyeste kontante kjøpspris der resultatet fortsatt når resultatkravet ditt. Regnes baklengs fra kalkylen. Ikke en budfullmakt eller garanti.' },
  hurdle: { term: 'Hurdle rate', def: 'Dine egne minimumskrav: minimum fortjeneste i kroner, minimum prosjektavkastning og minimum verdi på egen arbeidstime.' },
  hoveddel: { term: 'Hoveddel', def: 'Kjøkken, stue og soverom er hoveddel.' },
  tilleggsdel: { term: 'Tilleggsdel', def: 'Bod er tilleggsdel. Å gjøre bod til soverom er normalt en bruksendring som krever søknad.' },
  bruksendring: { term: 'Bruksendring', def: 'Endring av godkjent bruk av et rom. Normalt søknadspliktig. Sjekk alltid de sist godkjente tegningene hos kommunen.' },
  samsvarserklaering: { term: 'Samsvarserklæring', def: 'Dokumentasjon fra registrert elektrovirksomhet etter utført installasjonsarbeid. Skal følge anlegget.' },
  preakseptert: { term: 'Preakseptert løsning', def: 'En dokumentert måte å tilfredsstille et krav i TEK17 på.' },
  tek17: { term: 'TEK17', def: 'Byggteknisk forskrift som angir funksjonskravene, blant annet for våtrom og ventilasjon i soverom.' },
  sameie: { term: 'Sameie', def: 'Seksjonseierne eier fellesarealene i fellesskap. Vedtektene kan påvirke ansvarsfordelingen.' },
} as const;

export function glossaryEntry(key: string): GlossaryEntry | null {
  return GLOSSARY[key] ?? null;
}
