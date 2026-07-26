from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUT / "Spielregeln_Gelaendespiel_Pinggame.pdf"

NAVY = HexColor("#17324D")
BLUE = HexColor("#2B6F93")
LIGHT_BLUE = HexColor("#EAF4F8")
PALE_BLUE = HexColor("#F4F8FA")
GOLD = HexColor("#E8AA2C")
PALE_GOLD = HexColor("#FFF4D6")
RED = HexColor("#B33A3A")
PALE_RED = HexColor("#FCEBEC")
GREEN = HexColor("#2E7554")
PALE_GREEN = HexColor("#EAF5EF")
GRAY = HexColor("#536370")
LINE = HexColor("#D4E0E6")
WHITE = colors.white

PAGE_W, PAGE_H = A4
MARGIN_X = 18 * mm
MARGIN_TOP = 20 * mm
MARGIN_BOTTOM = 18 * mm

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="TitleCustom",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=25,
        leading=29,
        textColor=NAVY,
        alignment=TA_CENTER,
        spaceAfter=5 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="SubtitleCustom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11.5,
        leading=15,
        textColor=GRAY,
        alignment=TA_CENTER,
        spaceAfter=8 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="H1Custom",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=NAVY,
        spaceBefore=5 * mm,
        spaceAfter=2.5 * mm,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="H2Custom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14,
        textColor=BLUE,
        spaceBefore=2.5 * mm,
        spaceAfter=1.5 * mm,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.3,
        leading=14.3,
        textColor=NAVY,
        spaceAfter=2.2 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="BulletCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.1,
        leading=14,
        textColor=NAVY,
        leftIndent=5 * mm,
        firstLineIndent=0,
        bulletIndent=1.5 * mm,
        spaceAfter=1.5 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="CalloutTitle",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=NAVY,
        spaceAfter=1.5 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="CalloutBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.2,
        leading=14,
        textColor=NAVY,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=11.5,
        textColor=GRAY,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHead",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=9.6,
        leading=12,
        textColor=WHITE,
        alignment=TA_LEFT,
    )
)
styles.add(
    ParagraphStyle(
        name="TableBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.6,
        leading=12,
        textColor=NAVY,
    )
)


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(GRAY)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(MARGIN_X, PAGE_H - 10 * mm, "GELÄNDESPIEL | PINGGAME")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, PAGE_H - 12 * mm, PAGE_W - MARGIN_X, PAGE_H - 12 * mm)
    canvas.setFont("Helvetica", 8.5)
    canvas.drawRightString(PAGE_W - MARGIN_X, 9 * mm, f"Seite {doc.page}")
    canvas.restoreState()


frame = Frame(
    MARGIN_X,
    MARGIN_BOTTOM,
    PAGE_W - 2 * MARGIN_X,
    PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
    id="main",
    leftPadding=0,
    rightPadding=0,
    topPadding=0,
    bottomPadding=0,
)
doc = BaseDocTemplate(
    str(PDF_PATH),
    pagesize=A4,
    leftMargin=MARGIN_X,
    rightMargin=MARGIN_X,
    topMargin=MARGIN_TOP,
    bottomMargin=MARGIN_BOTTOM,
    title="Spielregeln Geländespiel - Pinggame",
    author="Pinggame Spielleitung",
)
doc.addPageTemplates([PageTemplate(id="standard", frames=[frame], onPage=header_footer)])


def h1(text):
    return Paragraph(text, styles["H1Custom"])


def h2(text):
    return Paragraph(text, styles["H2Custom"])


def body(text):
    return Paragraph(text, styles["BodyCustom"])


def bullet(text):
    return Paragraph(text, styles["BulletCustom"], bulletText="-")


def callout(title, text, fill=PALE_GOLD, border=GOLD):
    content = [
        Paragraph(title, styles["CalloutTitle"]),
        Paragraph(text, styles["CalloutBody"]),
    ]
    table = Table([[content]], colWidths=[PAGE_W - 2 * MARGIN_X])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), fill),
                ("BOX", (0, 0), (-1, -1), 1.2, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 6 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
            ]
        )
    )
    return KeepTogether([Spacer(1, 2 * mm), table, Spacer(1, 2 * mm)])


story = []
story.append(Spacer(1, 8 * mm))
story.append(Paragraph("SPIELREGELN", styles["TitleCustom"]))
story.append(
    Paragraph(
        "Geländespiel mit Fahrzeugen, Rätseln, Credits und einer digitalen Verfolgungsjagd",
        styles["SubtitleCustom"],
    )
)
story.append(
    callout(
        "DAS ZIEL",
        "Findet den Aktenkoffer des abgestürzten Agenten und verteidigt ihn. Gewonnen hat das Team, das den Koffer beim Ablauf der von der Spielleitung festgelegten Spielzeit besitzt.",
        PALE_GREEN,
        GREEN,
    )
)

story.append(h1("1. Teams und Voraussetzungen"))
story.append(body("Voraussichtlich nehmen acht Teams teil. Für jedes Team gelten folgende Voraussetzungen:"))
story.extend(
    [
        bullet("Mindestens eine volljährige Leitungsperson übernimmt die Verantwortung für das Team."),
        bullet("Jedes Team verfügt über ein Auto. Die Leitungsperson muss fahrberechtigt und fahrtüchtig sein."),
        bullet("Die Leitung benötigt ein geladenes Mobiltelefon mit mobilem Empfang und Zugriff auf das Pinggame."),
        bullet("Alle Spielerinnen und Spieler erhalten je ein Bändel."),
        bullet("Die Teamleitung ist für Sicherheit, Zusammenhalt und die Beachtung aller Nachrichten in der Webapp verantwortlich."),
    ]
)
story.append(h1("2. Anmeldung und Spielstart"))
story.extend(
    [
        bullet("Die Teamleitung meldet sich im Pinggame an."),
        bullet("Als Name kann der eigene Name oder ein frei gewählter Teamname verwendet werden. Dieser Name ist anschließend der offizielle Teamname."),
        bullet("Jedes Team erhält einen eigenen Startpunkt."),
        bullet("Jedes Team erhält einen Umschlag mit einem Starträtsel."),
        bullet("Am zugeteilten Startpunkt darf das Team den Umschlag öffnen und gemeinsam mit dem Lösen des Rätsels beginnen."),
        bullet("Die Lösung ergibt das Zugangspasswort für den ersten Zielbereich."),
    ]
)

story.append(h1("3. Suche nach dem Aktenkoffer"))
story.append(
    body(
        "Nach dem Lösen des Starträtsels fährt das Team zum freigeschalteten Zielbereich. Dort sucht es den Aktenkoffer, den ein Agent während eines Flugzeugabsturzes bei sich hatte."
    )
)
story.append(h2("Zusammenbleiben des Teams"))
story.append(
    body(
        "Ein Team muss während des gesamten Spiels zusammenbleiben. Alle Teammitglieder müssen sich gegenseitig in Sichtweite befinden. Die Teamleitung ist dafür verantwortlich, dass diese Regel eingehalten wird."
    )
)
story.append(
    callout(
        "WICHTIGE 5-MINUTEN-REGEL",
        "<b>Wird eine Person durch einen Kampf länger als 5 Minuten von ihrem Team getrennt, muss sie ebenfalls zu Fuß zur Zentrale zurückkehren.</b> Dort wartet sie, bis sie vom eigenen Team wieder abgeholt wird.",
        PALE_GOLD,
        GOLD,
    )
)

story.append(h1("4. Spieler ausschalten und Credits verdienen"))
story.append(body("Während der Suchphase können Teams gegnerische Spielerinnen und Spieler ausschalten:"))
story.extend(
    [
        bullet("Eine Person gilt als ausgeschaltet, sobald ein Gegner ihr Bändel zieht."),
        bullet("Das Bändel wird der ausgeschalteten Person sofort zurückgegeben."),
        bullet("Die ausgeschaltete Person trägt das Bändel sichtbar in der Hand und geht zu Fuß zur Zentrale."),
        bullet("In der Zentrale wartet die Person, bis sie vom eigenen Team abgeholt wird."),
        bullet("Bei der Spielleitung in der Zentrale meldet sie, welches Team sie ausgeschaltet hat."),
        bullet("Das erfolgreiche Team erhält dafür 1 Credit."),
    ]
)
story.append(h1("5. Credits und käufliche Hinweise"))
data = [
    [Paragraph("Leistung", styles["TableHead"]), Paragraph("Preis", styles["TableHead"])],
    [Paragraph("Zonenverkleinerung - Stufe 1", styles["TableBody"]), Paragraph("3 Credits", styles["TableBody"])],
    [Paragraph("Zonenverkleinerung - Stufe 2", styles["TableBody"]), Paragraph("5 Credits", styles["TableBody"])],
    [Paragraph("Zonenverkleinerung - Stufe 3", styles["TableBody"]), Paragraph("7 Credits", styles["TableBody"])],
    [Paragraph("Zonenverkleinerung - Stufe 4", styles["TableBody"]), Paragraph("15 Credits", styles["TableBody"])],
    [Paragraph("Schriftliche Versteckbeschreibung", styles["TableBody"]), Paragraph("17 Credits", styles["TableBody"])],
    [Paragraph("Bild des Ortes", styles["TableBody"]), Paragraph("20 Credits", styles["TableBody"])],
]
price_table = Table(data, colWidths=[125 * mm, 35 * mm], repeatRows=1)
price_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), BLUE),
            ("GRID", (0, 0), (-1, -1), 0.6, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5 * mm),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("BACKGROUND", (0, 2), (-1, 2), PALE_BLUE),
            ("BACKGROUND", (0, 4), (-1, 4), PALE_BLUE),
            ("BACKGROUND", (0, 6), (-1, 6), PALE_BLUE),
        ]
    )
)
story.append(price_table)
story.append(
    callout(
        "REIHENFOLGE DER ZONEN",
        "<b>Es darf keine Stufe der Zonenverkleinerung übersprungen werden.</b> Die Stufen müssen nacheinander gekauft werden.",
        PALE_GOLD,
        GOLD,
    )
)

story.append(h1("6. Der Koffer wird gefunden"))
story.append(
    callout(
        "SOFORT ÜBER DIE WEBAPP MELDEN",
        "<b>Sobald ein Team den Aktenkoffer gefunden hat, muss der Fund unverzüglich über die Benachrichtigungsfunktion des Pinggames dem Admin gemeldet werden.</b> Erst diese Meldung startet die nächste Spielphase.",
        PALE_RED,
        RED,
    )
)
story.append(body("Nach der Meldung geschieht Folgendes:"))
story.extend(
    [
        bullet("Der Ping und der Countdown werden aktiviert."),
        bullet("Das Team mit dem Koffer wird zum Agenten-Team."),
        bullet("Alle anderen Teams werden zu Huntern."),
        bullet("Die Hunter können die Agents mithilfe des im Pinggame angezeigten Standorts verfolgen."),
    ]
)
story.append(
    callout(
        "5 MINUTEN VORSPRUNG NACH DEM FUND",
        "<b>Das Agenten-Team erhält nach dem gemeldeten Kofferfund 5 Minuten Zeit, um den Fundort zu verlassen.</b> Während dieser gesamten Zeit müssen alle anderen Teams stehen bleiben.",
        PALE_GREEN,
        GREEN,
    )
)

story.append(h1("7. Agenten gegen Hunter"))
story.append(h2("Agenten ausschalten"))
story.append(
    body(
        "Ein Hunter-Team schaltet das Agenten-Team aus, indem es einer beliebigen Person des Agenten-Teams das Bändel zieht."
    )
)
story.append(
    callout(
        "REGELN FÜR AGENTS UND HUNTER",
        "<b>Agents dürfen keine Bändel mehr ziehen.</b> Sie dürfen nur flüchten und versuchen, den Koffer bis zum Spielende zu behalten.<br/><br/><b>Ein Hunter-Team darf das Agenten-Team nur fangen, wenn das eigene Team vollständig und vollzählig vor Ort ist.</b> Fehlt auch nur eine Person, ist der Catch ungültig.",
        PALE_GOLD,
        GOLD,
    )
)
story.extend(
    [
        bullet("Der Fang muss anschließend im Pinggame mit der Funktion «Catch melden» eingetragen werden."),
        bullet("Der Koffer wird erst übergeben, nachdem der Catch bestätigt wurde."),
        bullet("Nach der Bestätigung übergibt das bisherige Agenten-Team den Koffer an das erfolgreiche Hunter-Team."),
        bullet("Das erfolgreiche Hunter-Team wird dadurch zum neuen Agenten-Team. Die bisherigen Agents werden zu Huntern."),
    ]
)
story.append(
    callout(
        "3 MINUTEN VORSPRUNG NACH EINER ÜBERGABE",
        "<b>Nach jeder Kofferübergabe müssen alle Teams in der unmittelbaren Umgebung den neuen Agents 3 Minuten Vorsprung geben.</b> Sie bleiben während dieser Zeit stehen.",
        PALE_GREEN,
        GREEN,
    )
)
story.append(
    callout(
        "NACHRICHTEN IMMER BEACHTEN",
        "Die Teamleitungen müssen die Nachrichten im Pinggame fortlaufend im Blick behalten. Dort werden Rollenwechsel, bestätigte Catches, Wartezeiten und wichtige Anweisungen der Spielleitung mitgeteilt.",
        LIGHT_BLUE,
        BLUE,
    )
)

story.append(h1("8. Spielende und Sieg"))
story.append(
    body(
        "Das Spiel endet, sobald der von der Spielleitung festgelegte Countdown abgelaufen ist. Gewonnen hat das Team, das zu diesem Zeitpunkt den Aktenkoffer regelkonform besitzt."
    )
)

story.append(h1("9. Allgemeine Sicherheits- und Fairplayregeln"))
story.extend(
    [
        bullet("Anweisungen der Spielleitung haben jederzeit Vorrang."),
        bullet("Privatgrundstücke, gesperrte Bereiche und gefährliche Orte dürfen nicht betreten werden."),
        bullet("Straßen werden nur an sicheren Stellen überquert. Auf Straßen und Parkplätzen finden keine Kämpfe statt."),
        bullet("Wer sich verletzt, sich unsicher fühlt oder eine Gefahr erkennt, beendet die Aktion sofort und informiert die Spielleitung."),
        bullet("Der Koffer darf nicht versteckt, beschädigt, geworfen oder absichtlich unzugänglich gemacht werden."),
        bullet("Handys dürfen beim Laufen und Fahren nur so benutzt werden, dass niemand gefährdet wird."),
        bullet("Fairness geht vor Sieg. Streitfälle entscheidet die Spielleitung endgültig."),
    ]
)

story.append(h1("10. Kurzablauf"))
steps = [
    ("1", "Anmelden", "Teamleitung meldet das Team im Pinggame an."),
    ("2", "Startpunkt", "Zum zugeteilten Startpunkt fahren und Umschlag öffnen."),
    ("3", "Rätsel", "Starträtsel lösen und Zugangspasswort erhalten."),
    ("4", "Suchen", "Zielbereich freischalten und den Aktenkoffer suchen."),
    ("5", "Credits", "Gegner ausschalten, Credits verdienen und Hinweise kaufen."),
    ("6", "Fund melden", "Kofferfund sofort über die Benachrichtigungsfunktion melden."),
    ("7", "Pingphase", "Agents fliehen; Hunter verfolgen den angezeigten Standort."),
    ("8", "Catch", "Bändel ziehen, Catch melden, Bestätigung abwarten und Koffer übergeben."),
    ("9", "Sieg", "Beim Ablauf des Countdowns den Koffer besitzen."),
]
step_rows = [[
    Paragraph("Nr.", styles["TableHead"]),
    Paragraph("Phase", styles["TableHead"]),
    Paragraph("Aufgabe", styles["TableHead"]),
]]
for nr, phase, task in steps:
    step_rows.append(
        [
            Paragraph(nr, styles["TableBody"]),
            Paragraph(f"<b>{phase}</b>", styles["TableBody"]),
            Paragraph(task, styles["TableBody"]),
        ]
    )
steps_table = Table(step_rows, colWidths=[14 * mm, 35 * mm, 111 * mm], repeatRows=1)
steps_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), BLUE),
            ("GRID", (0, 0), (-1, -1), 0.6, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 1), (0, -1), "CENTER"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 2.4 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.4 * mm),
        ]
    )
)
story.append(steps_table)
story.append(Spacer(1, 5 * mm))
story.append(
    Paragraph(
        "Stand: Regelentwurf auf Grundlage der bisher festgelegten Spielbeschreibung. Die konkrete Startzeit, Endzeit und allfällige lokale Zusatzanweisungen werden von der Spielleitung bekannt gegeben.",
        styles["Small"],
    )
)

doc.build(story)
print(PDF_PATH)
