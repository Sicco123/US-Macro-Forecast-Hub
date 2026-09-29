window.MathJax = {
  tex: {
    inlineMath: [["$", "$"], ["\\(", "\\)"]],
    displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    processEscapes: true,
    processEnvironments: true,
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex",
  },
};
// Only mathematical pages need the typesetter; configure it before loading.
if (document.querySelector(".arithmatex")) {
  const script = document.createElement("script");
  script.src = "https://unpkg.com/mathjax@3/es5/tex-mml-chtml.js";
  script.async = true;
  document.head.append(script);
}
