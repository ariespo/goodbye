export const FONT_OPTIONS = [
  { id: 'renou-fangsong', name: '人偶仿宋', family: '"RenOuFangSong 16"' },
  { id: 'x12y12px-maru-minya', name: 'x12y12pxMaruMinya', family: '"x12y12pxMaruMinya"' },
  { id: 'z-labs-roundpix', name: 'Z Labs RoundPix', family: '"Z Labs RoundPix 12px M CN"' },
  { id: 'galmuri11', name: 'Galmuri11', family: '"Galmuri11 Regular"' },
  { id: 'mplus-hzk-12', name: 'mplus_hzk_12', family: '"mplus_hzk_12"' },
  { id: 'ark-pixel', name: 'Ark Pixel', family: '"Ark Pixel 12px Prop latin"' },
  { id: 'hanchan-16px', name: '寒蝉点阵体 16px', family: '"寒蝉点阵体 16px"' },
] as const;

export function getFontStack(fontFamilyId: string | undefined) {
  const option = FONT_OPTIONS.find(f => f.id === fontFamilyId) || FONT_OPTIONS[0];
  return `${option.family}, "MuzaiPixel", "LXGW WenKai", "Maple Mono CN", monospace`;
}

export function applyFontFamily(fontFamilyId: string | undefined) {
  const option = FONT_OPTIONS.find(f => f.id === fontFamilyId) || FONT_OPTIONS[0];
  document.documentElement.dataset.gameFont = option.id;
  document.documentElement.style.setProperty(
    '--game-font-family',
    getFontStack(option.id)
  );
  void document.fonts.load(`16px ${option.family}`);
}
