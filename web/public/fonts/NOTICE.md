# Fonts

`NotoSansMalayalam-subset.woff2` and `NotoSansTamil-subset.woff2` are subsets of
Noto Sans Malayalam and Noto Sans Tamil, licensed under the SIL Open Font License
version 1.1. The full licence text is in `OFL.txt`.

Both are variable fonts with a weight axis from 100 to 900, so one file per script
covers every weight the app uses.

They are self-hosted rather than loaded from a font CDN because the app has to
render at sea with no network at all. A stylesheet link would leave a fisherman
looking at empty boxes.

Regenerate with `tools/subset-fonts.py` after changing any translation. That
script keeps the complete Malayalam and Tamil blocks rather than only the
characters currently used, which barely costs anything and means a new string
cannot silently render as blank boxes. It also preserves the GSUB and GPOS layout
tables, without which Malayalam conjuncts and Tamil ligatures break.
