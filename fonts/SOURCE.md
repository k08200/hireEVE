# Self-hosted webfonts

| File | Family | Licence | Source |
|---|---|---|---|
| geist-var.woff2 | Geist (variable, 100–900) | OFL 1.1 | npm `geist@1.5.1` (Vercel) |
| instrument-serif{,-italic}.woff2 | Instrument Serif 400 | OFL 1.1 | Google Fonts v5, latin subset |

Self-hosted because the landing makes no third-party requests. The CSS
previously referenced "PP Editorial New" — a commercial face we hold no
licence for and never actually loaded; the serif accent now loads
Instrument Serif instead of silently falling back to Georgia.
