"""Formateador iCalendar (RFC 5545) de tareas con fechas, puro.

No toca base de datos ni estado global: recibe eventos ya construidos y la
marca de emision, que se le pasa por parametro para que la salida sea
determinista y testeable sin reloj.

Reglas que se cumplen aqui:

- El calendario se abre con VERSION 2.0 y PRODID propia.
- DTSTART y DTEND son fechas enteras (VALUE=DATE) y DTEND es EXCLUSIVA: se
  escribe el dia siguiente al fin, como manda el RFC.
- Las lineas no pasan de 75 octets, plegadas en octets UTF-8 y no en
  caracteres: un acento o un emoji pesan varios.
- El texto se escapa antes de plegar, para que una barra invertida escapada
  no se doble con el plegado.
- UID estable por tarea: reimportar el archivo actualiza el evento y no lo
  duplica.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

LINE_LIMIT = 75
"""Limite de octets por linea del RFC 5545. La primera parte mide hasta 75;
cada continuada empieza con espacio, que cuenta como un octet, y por eso va
a 74."""

CRLF = "\r\n"


@dataclass(frozen=True, slots=True)
class IcalPerson:
    """Persona del iCal: nombre de presentacion y correo."""

    name: str
    email: str


@dataclass(frozen=True, slots=True)
class IcalEvent:
    """Evento de un dia entero, con fechas ya resueltas.

    start_date y end_date son inclusive: la exclusividad de DTEND la pone el
    formateador, que escribe el dia siguiente al fin.
    """

    uid: str
    title: str
    description: str
    start_date: date
    # Si no hay fin, el evento dura un dia: el de inicio.
    end_date: date | None
    attendees: list[IcalPerson] = field(default_factory=list)
    organizer: IcalPerson | None = None
    url: str | None = None


def escape_ical(text: str) -> str:
    """Escapa el texto para una propiedad iCal.

    Primero la barra invertida, para no escapar dos veces; luego punto y
    coma y la barra. El salto de linea sale como barra + n, que es como el
    RFC manda leerlo.
    """
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _octets(text: str) -> int:
    """Peso en octets UTF-8 de un texto: un acento pesa dos, un emoji cuatro."""
    return len(text.encode("utf-8"))


def fold_line(line: str) -> list[str]:
    """Plega una linea a 75 octets, en octets UTF-8 y no en caracteres.

    Cada linea pesa hasta 75 octets. Una continuada empieza con espacio, que
    cuenta en los 75, de modo que su contenido va a 74. Un caracter multibyte
    no se parte: si no cabe, va a la linea siguiente.
    """
    parts: list[str] = []
    current = ""
    current_octets = 0
    limit = LINE_LIMIT
    for char in line:
        weight = _octets(char)
        if current_octets + weight > limit:
            parts.append(current)
            # El espacio de continuacion es parte de la linea y cuenta en
            # los 75; el contenido queda a 74.
            current = " " + char
            current_octets = weight + 1
            limit = LINE_LIMIT
        else:
            current += char
            current_octets += weight
    parts.append(current)
    return parts


def _property(name: str, value: str, params: str = "") -> list[str]:
    """Una propiedad iCal en sus lineas, ya escapada y plegada.

    `params` lleva el punto y coma inicial cuando no esta vacio:
    `;VALUE=DATE` o `;CN=Ana`.
    """
    return fold_line(f"{name}{params}:{value}")


def _person_property(name: str, person: IcalPerson) -> list[str]:
    return _property(
        name, f"mailto:{person.email}", f";CN={escape_ical(person.name)}"
    )


def format_calendar(events: Sequence[IcalEvent], dtstamp: datetime) -> str:
    """Calendario completo en texto iCal, terminado en CRLF.

    dtstamp es la marca de emision, en UTC: no se mira el reloj aqui, de
    modo que el resultado de dos llamadas con los mismos datos es el mismo.
    """
    stamp = dtstamp.strftime("%Y%m%dT%H%M%SZ")
    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CorePlanner//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for event in events:
        lines.append("BEGIN:VEVENT")
        lines.extend(_property("UID", event.uid))
        lines.extend(_property("DTSTAMP", stamp))
        lines.extend(
            _property(
                "DTSTART", event.start_date.strftime("%Y%m%d"), ";VALUE=DATE"
            )
        )
        fin = event.end_date or event.start_date
        fin_exclusivo = fin + timedelta(days=1)
        lines.extend(
            _property("DTEND", fin_exclusivo.strftime("%Y%m%d"), ";VALUE=DATE")
        )
        lines.extend(_property("SUMMARY", escape_ical(event.title)))
        if event.description:
            lines.extend(_property("DESCRIPTION", escape_ical(event.description)))
        if event.url:
            lines.extend(_property("URL", event.url))
        for attendee in event.attendees:
            lines.extend(_person_property("ATTENDEE", attendee))
        if event.organizer is not None:
            lines.extend(_person_property("ORGANIZER", event.organizer))
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return CRLF.join(lines) + CRLF
