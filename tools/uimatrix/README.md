UI matrix (manual, needs Google Chrome on macOS; not part of release-guard).
Loads the real index.html, scripts and css in headless Chrome with Firebase replaced by a stub (tools/uimatrix/stub.js) and fake group data (driver.js `setup()`), inside a 390px-wide iframe (a true phone width). For every theme (5 dark + 5 light palettes + all specials) x icon style x page it draws the page and records: page-h-scroll, off-screen, clipped-text, control-overflow, overlap (controls), plate-in-control, plate-in-circle, icon-too-big, icon-tiny, low-contrast (text < 3:1 on a solid background). Folded <details> are opened first.

    node tools/uimatrix/run.js            # all combos, about 6 minutes; result in tools/uimatrix/out/result.json
    TOP=200 node tools/uimatrix/run.js    # show more distinct problems

One combo only, with a screenshot: build, then open `tools/uimatrix/out/wrapper.html#{"themes":["dark/navy"],"icons":["box"],"pages":["settings"],"shot":1}` (UIM_H=1500 node tools/uimatrix/build.js for a taller frame).
Not covered: sheets / modals / share cards, real data volumes, animations, real devices. Add a page name to PAGES in driver.js when a new page ships. Sanity check of the detector: inject `.card{min-width:600px}` into a copy of harness.html and it must report off-screen.
