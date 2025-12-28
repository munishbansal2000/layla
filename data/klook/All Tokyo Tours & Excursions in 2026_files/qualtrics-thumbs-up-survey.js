// This file is used by the ThumbsUpBanner component

let QUALTRICS_LANGUAGE_MAP = {
  en: "EN",
  fr: "FR",
  de: "DE",
  es: "ES-ES",
  it: "IT",
  ja: "JA",
  pt: "PT-BR",
  nl: "NL",
  no: "NO",
  sv: "SV",
  da: "DA",
};

window.loadQualtricsThumbsUpSurvey = function loadQualtricsThumbsUpSurvey(
  language
) {
  // window.qualtricsLanguage is used on the Qualtrics side, so do not change it
  // use english as default language
  window.qualtricsLanguage = language ? QUALTRICS_LANGUAGE_MAP[language] : "EN";

  // [START] THIS IS A GENERATED FUNCTION FROM QUALTRICS
  const g = function (e, h, f, g) {
    this.get = function (a) {
      for (
        var a = `${a}=`, c = document.cookie.split(";"), b = 0, e = c.length;
        b < e;
        b++
      ) {
        for (var d = c[b]; d.charAt(0) == " "; ) d = d.substring(1, d.length);
        if (d.indexOf(a) == 0) return d.substring(a.length, d.length);
      }
      return null;
    };
    this.set = function (a, c) {
      var b = "";
      var b = new Date();
      b.setTime(b.getTime() + 6048e5);
      b = `; expires=${b.toGMTString()}`;
      document.cookie = `${a}=${c}${b}; path=/; `;
    };
    this.check = function () {
      let a = this.get(f);
      if (a) a = a.split(":");
      else if (e != 100)
        h == "v" && (e = Math.random() >= e / 100 ? 0 : 100),
          (a = [h, e, 0]),
          this.set(f, a.join(":"));
      else return !0;
      let c = a[1];
      if (c == 100) return !0;
      switch (a[0]) {
        case "v":
          return !1;
        case "r":
          return (
            (c = a[2] % Math.floor(100 / c)),
            a[2]++,
            this.set(f, a.join(":")),
            !c
          );
      }
      return !0;
    };
    this.go = function () {
      if (this.check()) {
        const a = document.createElement("script");
        a.type = "text/javascript";
        a.src = g;
        document.body && document.body.appendChild(a);
      }
    };
    this.start = function () {
      const t = this;
      document.readyState !== "complete"
        ? window.addEventListener
          ? window.addEventListener(
              "load",
              function () {
                t.go();
              },
              !1
            )
          : window.attachEvent &&
            window.attachEvent("onload", function () {
              t.go();
            })
        : t.go();
    };
  };
  try {
    new g(
      100,
      "r",
      "QSI_S_ZN_eDug1orOE1Jz3HU",
      "https://zn6qlz2bydohwnway-tripadvisor.siteintercept.qualtrics.com/SIE/?Q_ZID=ZN_eDug1orOE1Jz3HU"
    ).start();
  } catch (i) {
    console.warn("Qualtrics thumbs up intercept script failed to load.");
  }
  // [END] THIS IS A GENERATED FUNCTION FROM QUALTRICS
};
