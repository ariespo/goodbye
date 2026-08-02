import { describe, expect, it } from 'vitest';
import { getItemsForBackground } from './itemAssetMatch';

describe('getItemsForBackground', () => {
  it('matches bedroom items for day and night variants', () => {
    const dayIds = getItemsForBackground('bedroom1-day').map(item => item.id);
    const nightIds = getItemsForBackground('bedroom1-night.png').map(item => item.id);

    expect(dayIds).toContain('bedroom-medicine-bottle');
    expect(nightIds).toContain('bedroom-medicine-bottle');
  });

  it('matches convenience-store items for day and night variants', () => {
    const dayIds = getItemsForBackground('supermarket-day').map(item => item.id);
    const nightIds = getItemsForBackground('supermarket-night').map(item => item.id);

    expect(dayIds).toContain('convenience-store-receipt');
    expect(nightIds).toContain('convenience-store-bandaid');
  });
});
