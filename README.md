# India's Development Equation

How rich must Indians be for India to be called developed? An interactive explainer built on Neelkanth Mishra's article [How rich must Indians be for India to be called developed?](https://timesofindia.indiatimes.com/india/how-rich-must-indians-be-for-india-to-be-called-developed/articleshow/132126921.cms) (2 July 2026). Move growth, inflation, the rupee and population, and watch the year India crosses the World Bank's high-income line move with them.

Live at **https://lfe.econforeverybody.com/experiments/india-development/**, part of the [Experiments](https://lfe.econforeverybody.com/experiments/) on Learn For Everybody.

Four tabs:

- **Source:** a guide to the article and the textbook chapters it illuminates.
- **Rankings:** a World Bank ladder of GDP per person, showing how China, Vietnam and India moved up the table from 1990 to 2024.
- **Primer:** the calculator, with the arithmetic, the demographic clock and a labour–capital–productivity "engine".
- **Chautauqua:** discussion questions built on the same model.

## Run it

Plain HTML, CSS and JavaScript; no build step, nothing to install.

```bash
python3 -m http.server 8000 --directory site
```

Then open http://localhost:8000/experiments/india-development/

The links in the top bars point to the rest of Learn For Everybody, so they only work on the live site, not on your computer.

## How it works

- `site/experiments/india-development/app.js` holds the model and the World Bank series (GDP per person, current US dollars, indicator NY.GDP.PCAP.CD) used for the rankings.
- The crossing year is the first whole year in which India's projected nominal GDP per person in dollars is at least the high-income line:

```
g_usd = (1 + real growth) × (1 + inflation) / (1 + rupee depreciation) / (1 + population growth) − 1
line_t = line_2025 × (1 + threshold growth)^t
```

## Do better

1. **Purchasing power.** The calculator works in nominal dollars, because that is how the World Bank classifies countries. Add a PPP view and show what changes, and what does not.
2. **A better clock.** The demographic band is a single year (median age 40). Replace it with UN population projections of the working-age share, year by year.
3. **The engine's defaults.** The labour, capital and productivity sliders start at generous values, closer to India's best investment years than to its average. Calibrate them to a published growth-accounting study (for example India KLEMS) and cite it.
4. **Rankings with a fixed sample.** Rank only the economies that have data in every year, so dropouts cannot move India up the table.
5. **Live inputs.** Start the calculator from the latest inflation, rupee and growth figures, for example from the [India economy dashboard](https://github.com/ashishefe/lfe-india-economy).

## What we got wrong

See [WHAT-WE-GOT-WRONG.md](WHAT-WE-GOT-WRONG.md).

## How this was made

Ashish Kulkarni picked the article and shaped the explainer. Claude, an AI model, wrote the code and first drafts. Independent AI reviewers checked the numbers against their sources and found real errors, listed in WHAT-WE-GOT-WRONG.md.

## Licence

- **Code** (the HTML, CSS and JavaScript): [MIT](LICENSE).
- **Words** (the explainer's text, this README and the other documents): [CC BY 4.0](LICENSE-TEXT.md). Reuse them with credit to Ashish Kulkarni / Learn For Everybody.
- **The article** is Neelkanth Mishra's; this repo only links to it and quotes a fragment. **The World Bank data** in `app.js` is published under CC BY 4.0 by the World Bank; credit it if you reuse it.

The page's look comes from the Learn For Everybody house style (`site/assets/`), included so the page renders. Feel free to replace it with your own.
