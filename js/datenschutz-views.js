// Datenschutz & Sicherheit: verständliche Elterninformation (eine formale Datenschutzerklärung folgt ggf. später).
// Ohne Profil und ohne Eltern-PIN erreichbar, damit Eltern sie vor dem Einrichten lesen können.
import { esc } from './util.js';

const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;

export async function datenschutzView(_p, ctx) {
  const html = `
    <section class="card text-seite" id="info" aria-labelledby="ds-info">
      <h2 id="ds-info" style="margin-top:0">🔒 Datenschutz & Sicherheit – was Eltern wissen sollten</h2>
      <h3>Kurz gesagt</h3>
      <p>Vokabel-Studio speichert alles <strong>nur auf diesem Gerät</strong>. Es gibt <strong>keine Anmeldung beim Betreiber, keinen eigenen Server, keine Werbung und keine Nutzungs-Statistik</strong>. Daten verlassen das Gerät nur, wenn Sie selbst eine Funktion dafür einschalten – etwa die KI-Auswertung oder den OneDrive-Abgleich.</p>

      <h3>Wo liegen die Daten?</h3>
      <ul>
        <li>Profile, Vokabeln, Lernstände und Gutscheine liegen im Speicher des Browsers auf diesem Handy oder Tablet. Nur Vokabel-Studio selbst kann ihn lesen – andere Webseiten und Apps nicht, dafür sorgt der Browser.</li>
        <li>Gespeichert werden nur der <strong>Vorname oder Spitzname</strong> des Kindes, eine Figur, die Vokabeln und der Lernfortschritt. <strong>Keine</strong> E-Mail-Adresse, kein Geburtsdatum, keine Anschrift, keine Fotos.</li>
      </ul>

      <h3>Ist die App ein Einfallstor für Angriffe auf meine Daten?</h3>
      <p>Nach allem, was die App technisch kann: <strong>nein</strong>. Vokabel-Studio ist eine Web-App und läuft im abgeschotteten Bereich des Browsers („Sandbox“). Sie kann deshalb</p>
      <ul>
        <li><strong>nicht</strong> auf Ihre Fotos, Kontakte, Nachrichten, E-Mails oder andere Apps zugreifen,</li>
        <li><strong>keine</strong> Programme installieren oder Einstellungen am Gerät ändern,</li>
        <li>Kamera und Mikrofon <strong>nur</strong> benutzen, wenn Sie gerade selbst darauf tippen und der Browser Sie um Erlaubnis gefragt hat,</li>
        <li>Fotos <strong>nur</strong> sehen, die Sie zum Einlesen selbst auswählen oder aufnehmen.</li>
      </ul>
      <p>Zusätzlich gilt eine <strong>Sicherheitsregel</strong> (Content-Security-Policy): Der Browser erlaubt der App nur, Dateien von ihrer eigenen Adresse zu laden und nur mit diesen Diensten zu sprechen: den KI-Anbietern (Google Gemini, Mistral, Groq, OpenRouter) und Microsoft (Anmeldung und OneDrive). Jede andere Verbindung blockiert der Browser – selbst dann, wenn im Code ein Fehler wäre.</p>
      <p>Halten Sie Browser und Betriebssystem aktuell – Updates schließen Sicherheitslücken.</p>

      <h3>Wann verlassen Daten das Gerät?</h3>
      <p>Nur bei diesen Funktionen – und nur, wenn Sie sie nutzen:</p>
      <div class="tabelle-scroll" tabindex="0" role="region" aria-label="Tabelle: Wann Daten das Gerät verlassen"><table class="info-tabelle">
        <thead><tr><th scope="col">Funktion</th><th scope="col">Was übertragen wird</th><th scope="col">An wen</th></tr></thead>
        <tbody>
          <tr><td>Vokabelseite per KI einlesen</td><td>Foto der Buchseite bzw. kopierter Text</td><td>der eingerichtete KI-Anbieter</td></tr>
          <tr><td>Eigene Sätze von der KI prüfen lassen</td><td>Satz des Kindes und das Vokabelwort</td><td>der KI-Anbieter</td></tr>
          <tr><td>OneDrive-Abgleich</td><td>alle Daten der App (ohne KI-Schlüssel und PIN)</td><td>Ihr <strong>eigenes</strong> OneDrive, Ordner „Apps/Vokabel-Studio“</td></tr>
          <tr><td>Spracheingabe (Mikrofon)</td><td>die gesprochene Antwort</td><td>je nach Gerät die Spracherkennung von Google oder Apple – wie beim Diktieren auf der Tastatur</td></tr>
          <tr><td>Weg über ChatGPT/Gemini</td><td>was Sie dort selbst einfügen</td><td>der jeweilige Chatbot (nicht über die App)</td></tr>
        </tbody>
      </table></div>
      <p><strong>Wichtig bei kostenlosen KI-Zugängen:</strong> Manche Anbieter dürfen Eingaben speichern und zum Verbessern ihrer KI nutzen (z. B. Google im Gratis-Zugang). Fotos von Vokabelseiten sind unbedenklich – bei eigenen Sätzen sollten Kinder aber <strong>keine persönlichen Dinge</strong> schreiben (keine Namen, Adressen, Schulnamen).</p>

      <h3>Der OneDrive-Abgleich</h3>
      <ul>
        <li>Die App bekommt bei Microsoft nur Zugriff auf <strong>ihren eigenen Ordner</strong> – nicht auf Ihre anderen Dateien, Fotos oder Dokumente.</li>
        <li>Die Anmeldung läuft direkt bei Microsoft. Ihr Passwort sieht die App nie.</li>
        <li>Die Daten gehen direkt von Ihrem Gerät in Ihr OneDrive. Der Betreiber der App hat <strong>keinen Zugriff</strong> darauf – es gibt keinen Server dazwischen.</li>
        <li>Beenden: in der App mit „Trennen“ oder bei Microsoft unter ${link('https://account.microsoft.com/privacy/app-access', 'account.microsoft.com › Datenschutz › App-Zugriff')}.</li>
      </ul>

      <h3>KI-Schlüssel und Eltern-PIN</h3>
      <ul>
        <li><strong>KI-Schlüssel</strong> bleiben nur auf diesem Gerät. Sie kommen weder in Sicherungsdateien noch in den OneDrive-Abgleich.</li>
        <li><strong>Eltern-PIN:</strong> Die PIN selbst wird nicht gespeichert, nur eine verschlüsselte Prüfsumme. Sie ist eine <strong>Kindersicherung, kein Tresor</strong>: Wer das Gerät entsperrt in der Hand hat und sich technisch auskennt, kann die App-Daten trotzdem auslesen. Schützen Sie das Gerät deshalb mit einer Bildschirmsperre.</li>
      </ul>

      <h3>Sicherungsdateien und Vokabelpakete</h3>
      <p>Eine <strong>Sicherungsdatei</strong> enthält alle Daten der App im Klartext – Vornamen der Kinder, Lernstände, Vokabeln. Bewahren Sie sie auf wie andere private Dateien und schicken Sie sie nicht an Fremde. <strong>Vokabelpakete</strong> zum Weitergeben enthalten dagegen nur Vokabeln, keine Namen und keinen Lernstand.</p>

      <h3>Restrisiken – ehrlich benannt</h3>
      <ul>
        <li><strong>Verlorenes oder ungesperrtes Gerät:</strong> Wer es entsperrt hat, sieht die Daten → Bildschirmsperre verwenden.</li>
        <li><strong>App gelöscht oder Browser-Speicher geleert:</strong> Daten weg → OneDrive-Abgleich oder regelmäßig sichern.</li>
        <li><strong>Veränderung der App selbst:</strong> Würde jemand das Entwicklerkonto übernehmen, könnte er den App-Code verändern. Dagegen schützen automatische Tests bei jeder Änderung und die Sicherheitsregel, die begrenzt, wohin Daten überhaupt gehen könnten.</li>
      </ul>
    </section>

    </section>`;
  return {
    title: 'Datenschutz & Sicherheit', back: ctx.profil ? 'history' : 'profile', hideProfile: !ctx.profil, html
  };
}
