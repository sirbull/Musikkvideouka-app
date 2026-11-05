// The same six-decimal precision used by score calculations, displayed with Norwegian decimal commas.
(() => {
  const formatter = new Intl.NumberFormat("nb-NO", { useGrouping: false, maximumFractionDigits: 6 });
  window.formatScore = (value) => formatter.format(value);
})();
