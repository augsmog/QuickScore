# Scorecard Test Images

Place real scorecard photos here for OCR pipeline testing.

## Expected Fixtures

Each image should have a corresponding fixture in `src/engine/__tests__/scorecard-fixtures.ts` with manually-verified expected scores.

| Filename | Players | Format | OCR Difficulty |
|----------|---------|--------|----------------|
| `yates-smith-shure-kirk.jpg` | 4 | Handwritten, circled scores | High — circles, multiple tee rows |
| `gibson-munson-fox.jpg` | 3 | Semi-clean handwriting | Medium — hole illustrations at top |
| `vintage-card.jpg` | 1+ | Vintage pencil on aged paper | Very High — low contrast, old format |

## Adding New Test Cards

1. Photo the scorecard with good lighting
2. Name the file descriptively (e.g., `jones-4player-pebble.jpg`)
3. Add a fixture to `scorecard-fixtures.ts` with manually-read scores
4. Run `npx tsx src/engine/__tests__/ocr-validation.ts` to compare

## OCR Validation

The `scorecard-fixtures.ts` file includes a `validateOCRResult()` function that compares
OCR output against expected scores and reports mismatches with severity levels.
