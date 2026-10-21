import { CountUp as SharedCountUp } from '../shared/CountUp';

type Props = Omit<Parameters<typeof SharedCountUp>[0], 'flashClass'>;

/** Investments tallanimasjon: delt implementasjon (`../shared/CountUp`) med Investments lysglimt. Uendret oppførsel. */
export function CountUp(props: Props) {
  return <SharedCountUp {...props} flashClass="inv-flash" />;
}
