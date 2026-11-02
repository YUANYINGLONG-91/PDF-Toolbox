"""Native Qt stylesheet shared by the desktop interface."""

STYLE = """
QWidget {
    font-family: "Segoe UI";
    font-size: 14px;
    color: #1E293B;
}
QMainWindow, QWidget#root, QFrame#workspace, QStackedWidget#toolStack {
    background: #F3F6FA;
}
QFrame#sidebar {
    background: #101C30;
    border: 0;
}
QFrame#sidebar QLabel {
    color: #A9B8CC;
}
QLabel#brandMark {
    background: #2F6FED;
    color: white;
    border-radius: 11px;
    font-size: 15px;
    font-weight: 700;
}
QLabel#brandTitle {
    color: white;
    font-size: 19px;
    font-weight: 650;
}
QLabel#brandSubtitle, QLabel#navigationCaption, QLabel#privacyCaption {
    color: #8395AE;
    font-size: 11px;
}
QLabel#navigationCaption {
    font-weight: 650;
}
QFrame#privacyPanel {
    background: #17263D;
    border: 1px solid #253750;
    border-radius: 10px;
}
QLabel#privacyTitle {
    color: #DCE7F5;
    font-size: 12px;
    font-weight: 650;
}
QLineEdit#navigationSearch {
    background: #17263D;
    border: 1px solid #2A3B53;
    border-radius: 8px;
    color: #EDF4FC;
    padding: 8px 10px;
    selection-background-color: #2F6FED;
}
QLineEdit#navigationSearch:focus {
    border: 1px solid #5B8DEF;
    background: #1B2C46;
}
QListWidget#navigation {
    background: transparent;
    border: 0;
    padding: 0;
    outline: 0;
    color: #C6D3E3;
    font-size: 14px;
}
QListWidget#navigation::item {
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 8px 10px;
    margin: 1px 0;
}
QListWidget#navigation::item:hover {
    background: #192A43;
    color: white;
}
QListWidget#navigation::item:selected {
    background: #2458B8;
    border: 1px solid #3B71D0;
    color: white;
    font-weight: 600;
}
QLabel#pageTitle {
    color: #12233C;
    font-size: 28px;
    font-weight: 700;
}
QLabel#pageDescription {
    color: #64748B;
    font-size: 14px;
}
QLabel#sectionTitle {
    color: #1E3A5F;
    font-size: 15px;
    font-weight: 650;
}
QLabel#helperText, QLabel#mutedText {
    color: #718096;
    font-size: 12px;
}
QLabel#versionBadge {
    background: #E7EFFC;
    color: #285AA9;
    border: 1px solid #CFDEF5;
    border-radius: 9px;
    padding: 4px 9px;
    font-size: 12px;
    font-weight: 600;
}
QScrollArea#settingsScroll, QWidget#settingsContent {
    background: transparent;
    border: 0;
}
QLabel#engineEntry {
    background: #F7F9FC;
    border: 1px solid #E4EAF1;
    border-radius: 8px;
    padding: 10px;
    color: #52677F;
    font-size: 12px;
}
QGroupBox, QFrame#card {
    background: white;
    border: 1px solid #DCE4EE;
    border-radius: 12px;
}
QGroupBox {
    margin-top: 13px;
    padding: 18px;
    padding-top: 22px;
    font-weight: 600;
}
QGroupBox::title {
    subcontrol-origin: margin;
    subcontrol-position: top left;
    left: 14px;
    padding: 0 6px;
    background: white;
    color: #27415F;
    font-size: 14px;
    font-weight: 650;
}
QFrame#optionsBar {
    background: #F7F9FC;
    border: 1px solid #E4EAF1;
    border-radius: 9px;
}
QLineEdit, QComboBox, QSpinBox, QPlainTextEdit, QListWidget {
    background: white;
    border: 1px solid #CBD5E1;
    border-radius: 7px;
    padding: 7px 9px;
    selection-background-color: #2F6FED;
    selection-color: white;
}
QLineEdit, QComboBox, QSpinBox {
    min-height: 21px;
}
QLineEdit:hover, QComboBox:hover, QSpinBox:hover, QPlainTextEdit:hover, QListWidget:hover {
    border-color: #9FB1C5;
}
QLineEdit:focus, QComboBox:focus, QSpinBox:focus, QPlainTextEdit:focus, QListWidget:focus {
    border: 1px solid #4B7FE0;
}
QLineEdit:disabled, QComboBox:disabled, QSpinBox:disabled, QPlainTextEdit:disabled, QListWidget:disabled {
    background: #EEF2F6;
    color: #8A99AA;
}
QComboBox {
    padding-right: 28px;
}
QComboBox::drop-down {
    border: 0;
    width: 26px;
}
QComboBox QAbstractItemView {
    background: white;
    border: 1px solid #CBD5E1;
    selection-background-color: #E7EFFC;
    selection-color: #183A68;
    padding: 4px;
}
QListWidget {
    padding: 6px;
    outline: 0;
}
QListWidget::item {
    border-radius: 6px;
    padding: 6px;
}
QListWidget::item:hover {
    background: #F0F5FB;
}
QListWidget::item:selected {
    background: #E5EEFC;
    color: #1E4F96;
    border: 1px solid #C4D7F5;
}
QPushButton {
    background: white;
    border: 1px solid #C5D1DE;
    border-radius: 7px;
    color: #2A3E55;
    padding: 8px 14px;
    min-height: 20px;
    font-weight: 550;
}
QPushButton:hover {
    background: #F0F5FB;
    border-color: #8DA8C6;
    color: #173A66;
}
QPushButton:pressed {
    background: #E1EAF5;
}
QPushButton:focus {
    border: 1px solid #4B7FE0;
}
QPushButton#primaryButton {
    background: #2F6FED;
    border: 1px solid #2F6FED;
    color: white;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 650;
}
QPushButton#primaryButton:hover {
    background: #245FCE;
    border-color: #245FCE;
    color: white;
}
QPushButton#primaryButton:pressed {
    background: #1D4FAF;
    border-color: #1D4FAF;
}
QPushButton#quietButton {
    background: transparent;
    border-color: transparent;
    color: #496580;
}
QPushButton#quietButton:hover {
    background: #EDF2F8;
    border-color: #D9E3EE;
}
QPushButton#dangerButton {
    background: white;
    border-color: #E4C6C6;
    color: #A23B3B;
}
QPushButton#dangerButton:hover {
    background: #FFF3F3;
    border-color: #D89A9A;
    color: #8E2929;
}
QPushButton:disabled {
    background: #EDF1F5;
    border-color: #E0E6ED;
    color: #93A1B1;
}
QCheckBox {
    spacing: 8px;
    color: #33465D;
}
QCheckBox::indicator {
    width: 17px;
    height: 17px;
}
QProgressBar {
    background: #E4EAF2;
    border: 0;
    border-radius: 4px;
    min-height: 8px;
    max-height: 8px;
    text-align: center;
}
QProgressBar::chunk {
    background: #2F6FED;
    border-radius: 4px;
}
QFrame#jobPanel {
    background: white;
    border: 1px solid #DCE4EE;
    border-radius: 12px;
}
QLabel#activityCaption {
    color: #8090A3;
    font-size: 11px;
    font-weight: 650;
}
QLabel#statusDot {
    color: #2D9A6A;
    font-size: 15px;
}
QLabel#statusDot[state="running"] { color: #2F6FED; }
QLabel#statusDot[state="success"] { color: #2D9A6A; }
QLabel#statusDot[state="error"] { color: #C64B4B; }
QLabel#statusDot[state="cancelled"] { color: #B17B24; }
QPlainTextEdit#jobLog {
    background: #111D2E;
    color: #D4E1EF;
    border: 1px solid #263A52;
    border-radius: 8px;
    font-family: "Consolas";
    font-size: 12px;
    padding: 10px;
}
QLabel#previewSurface {
    background: #172131;
    color: #B7C5D6;
    border: 1px solid #2C3A4D;
    border-radius: 10px;
    padding: 10px;
}
QTabWidget, QTabBar {
    background: #F3F6FA;
}
QTabWidget::pane {
    background: white;
    border: 1px solid #DCE4EE;
    border-radius: 10px;
    top: -1px;
}
QTabBar::tab {
    background: transparent;
    color: #64748B;
    padding: 11px 20px;
    margin-right: 4px;
    border-bottom: 2px solid transparent;
    font-weight: 600;
}
QTabBar::tab:hover {
    color: #285AA9;
    background: #EDF3FC;
}
QTabBar::tab:selected {
    color: #245FCE;
    border-bottom: 2px solid #2F6FED;
}
QSplitter::handle {
    background: transparent;
    width: 12px;
    height: 12px;
}
QScrollBar:vertical {
    background: transparent;
    width: 11px;
    margin: 2px;
}
QScrollBar::handle:vertical {
    background: #B9C6D5;
    border-radius: 4px;
    min-height: 28px;
}
QScrollBar::handle:vertical:hover { background: #91A4B9; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
QScrollBar:horizontal {
    background: transparent;
    height: 11px;
    margin: 2px;
}
QScrollBar::handle:horizontal {
    background: #B9C6D5;
    border-radius: 4px;
    min-width: 28px;
}
QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal { width: 0; }
QToolTip {
    background: #15243A;
    color: white;
    border: 1px solid #2A3D57;
    padding: 6px;
}
"""
