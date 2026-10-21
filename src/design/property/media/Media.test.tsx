import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DocumentImages, FLOORPLAN_PLACEHOLDER_TEXT, FloorPlanPanel, HERO_PLACEHOLDER_TEXT, HeroMedia } from './Media';
import { EMPTY_MEDIA, type ListingMedia } from './types';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('mediekomponenter: plassholder uten data, ekte media når de finnes', () => {
  it('hovedbilde uten media gir en merket plassholder med tilgjengelig navn – og ingen <img>', () => {
    const out = html(<HeroMedia media={EMPTY_MEDIA} address="Elvekanten 17 B" />);
    expect(out).toContain(HERO_PLACEHOLDER_TEXT);
    expect(out).toContain('role="img"');
    expect(out).toContain('Plassholder for annonsebilde av Elvekanten 17 B');
    expect(out).not.toContain('<img');
  });

  it('hovedbilde med media viser bildet med alt-tekst og ingen plassholder', () => {
    const media: ListingMedia = { ...EMPTY_MEDIA, mainImage: { id: 'a', url: '/favicon.svg', alt: 'Fasade mot gaten' }, images: [{ id: 'a', url: '/favicon.svg', alt: 'Fasade mot gaten' }, { id: 'b', url: '/favicon.svg', alt: 'Stue' }] };
    const out = html(<HeroMedia media={media} address="x" />);
    expect(out).toContain('alt="Fasade mot gaten"');
    expect(out).not.toContain(HERO_PLACEHOLDER_TEXT);
    expect(out).toContain('Vis bilde 2 av 2: Stue');
  });

  it('plantegning uten media: merket plassholder (ingen oppdiktet plan), og kan skilles for i dag og etter', () => {
    const cur = html(<FloorPlanPanel media={EMPTY_MEDIA} scenarioId={null} kind="current" label="Dagens planløsning" />);
    expect(cur).toContain(FLOORPLAN_PLACEHOLDER_TEXT);
    expect(cur).toContain('Dagens planløsning');
    expect(cur).not.toContain('<img');
    const after = html(<FloorPlanPanel media={EMPTY_MEDIA} scenarioId="s1" kind="proposed" label="Planløsning etter Alternativ A" />);
    expect(after).toContain('Planløsning etter Alternativ A');
  });

  it('plantegning med media: viser bare planene som hører til scenarioet, med rullbar beholder og lenke til full størrelse', () => {
    const media: ListingMedia = {
      ...EMPTY_MEDIA,
      floorPlans: [
        { id: 'i-dag', url: '/i-dag.png', alt: 'Plan i dag', kind: 'current' },
        { id: 'a', url: '/a.png', alt: 'Plan for A', kind: 'proposed', scenarioId: 's1' },
        { id: 'b', url: '/b.png', alt: 'Plan for B', kind: 'proposed', scenarioId: 's2' },
      ],
    };
    const proposed = html(<FloorPlanPanel media={media} scenarioId="s1" kind="proposed" label="Etter" />);
    expect(proposed).toContain('alt="Plan for A"');
    expect(proposed).not.toContain('Plan for B');
    expect(proposed).toContain('Åpne i full størrelse');
    expect(proposed).toContain('tabindex="0"');
    expect(proposed).not.toContain(FLOORPLAN_PLACEHOLDER_TEXT);
    const cur = html(<FloorPlanPanel media={media} scenarioId="s1" kind="current" label="I dag" />);
    expect(cur).toContain('alt="Plan i dag"');
  });

  it('dokumentbilder vises bare når de finnes', () => {
    expect(html(<DocumentImages items={[]} />)).toBe('');
    expect(html(<DocumentImages items={[{ id: 'd', url: '/d.png', alt: 'Side 3', title: 'Tilstandsrapport', page: 3 }]} />)).toContain('Tilstandsrapport · side 3');
  });
});
