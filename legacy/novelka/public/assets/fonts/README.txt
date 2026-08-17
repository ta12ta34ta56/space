DROP YOUR FONT FILES IN THIS FOLDER
===================================

WHICH FILES DO I NEED?
A font family is usually downloaded as several files - one per style:

    Poppins-Regular.ttf      <- REQUIRED (this is the base)
    Poppins-Bold.ttf         <- recommended (used by the Bold button)
    Poppins-Italic.ttf       <- optional  (used by the Italic button)
    Poppins-BoldItalic.ttf   <- optional
    Poppins-Thin.ttf         <- skip unless you really want it
    Poppins-Black.ttf        <- skip unless you really want it

You do NOT need all of them. Regular alone works fine.
Regular + Bold covers 95% of real use.

NAMING RULE (important - this is how the app groups them):
    FamilyName-Style.ttf
Use a hyphen before the style. Examples:

    Lobster-Regular.ttf
    GreatVibes-Regular.ttf
    Quicksand-Regular.ttf
    Quicksand-Bold.ttf

Accepted styles: Regular, Bold, Italic, BoldItalic, Light, Medium,
SemiBold, ExtraBold, Black (and their Italic versions).

FORMATS: .ttf  .otf  .woff  .woff2   (woff2 is smallest and loads fastest)

VARIABLE FONTS: a single file like "Inter-VariableFont_wght.ttf" also
works - rename it to Inter-Regular.ttf and the browser handles the weights.

AFTER ADDING FILES:
Run  npm run fonts   in the project folder. That scans this directory and
regenerates src/engine/local-fonts.ts so the app picks the fonts up.
Then restart the dev server.
