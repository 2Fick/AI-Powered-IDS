# Written report

A five page comparison of the three detectors, with every figure drawn from the
JSON reports the pipeline produces. Nothing here is typed in by hand, so the
paper and the dashboard cannot drift apart.

## Building

Needs a LaTeX distribution with `pdflatex` on the path. MiKTeX or TeX Live both
work.

```bash
python -m ids.report.figures
cd report
pdflatex -output-directory=build main.tex
pdflatex -output-directory=build main.tex
```

The second pass is what resolves the figure and table references. The result is
`report/build/main.pdf`.

The figures read `reports/*.json`, so run the experiments first. A missing
report is skipped with a note rather than failing, but the document expects all
of them.
