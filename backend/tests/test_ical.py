"""Pruebas del formateador iCal (backend/services/ical.py).

Sin base de datos: el formateador es puro y se prueba con eventos
construidos a mano. Las fechas del ejemplo son de la semana del 2 al 6 de
marzo de 2026 (lunes a viernes).
"""

from __future__ import annotations

from datetime import date, datetime

from backend.services.ical import IcalEvent, IcalPerson, format_calendar

DTSTAMP = datetime(2026, 11, 21, 10, 30, 0)


def evento(**kwargs) -> IcalEvent:
    base = dict(
        uid="task-1@coreplanner",
        title="Programacion",
        description="",
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 6),
    )
    base.update(kwargs)
    return IcalEvent(**base)


def summary_lines(texto: str) -> list[str]:
    """Las lineas de la propiedad SUMMARY, con sus continuadas de plegado.

    Una continuada empieza con espacio; el bloque acaba donde empieza la
    siguiente propiedad.
    """
    lines = texto.split("\r\n")
    i = 0
    while i < len(lines):
        if lines[i].startswith("SUMMARY:"):
            bloque = [lines[i]]
            i += 1
            while i < len(lines) and lines[i].startswith(" "):
                bloque.append(lines[i])
                i += 1
            return bloque
        i += 1
    return []


def test_el_calendario_se_abre_y_cierra_con_las_cabeceras():
    texto = format_calendar([evento()], DTSTAMP)
    lineas = texto.split("\r\n")
    assert lineas[0] == "BEGIN:VCALENDAR"
    assert lineas[1] == "VERSION:2.0"
    assert lineas[2] == "PRODID:-//CorePlanner//ES"
    assert lineas[3] == "CALSCALE:GREGORIAN"
    assert lineas[4] == "METHOD:PUBLISH"
    assert "BEGIN:VEVENT" in lineas
    assert "END:VEVENT" in lineas
    assert lineas[-2] == "END:VCALENDAR"


def test_el_dtend_es_exclusivo_un_dia_despues_del_fin():
    texto = format_calendar([evento()], DTSTAMP)
    # Fin inclusivo el viernes 6: el exclusivo, el sabado 7.
    assert "DTSTART;VALUE=DATE:20260302" in texto
    assert "DTEND;VALUE=DATE:20260307" in texto
    assert "DTSTAMP:20261121T103000Z" in texto


def test_un_dia_sin_fecha_de_fin_sal_el_dia_mismo():
    texto = format_calendar([evento(start_date=date(2026, 3, 2), end_date=None)], DTSTAMP)
    assert "DTSTART;VALUE=DATE:20260302" in texto
    assert "DTEND;VALUE=DATE:20260303" in texto


def test_el_texto_se_escapa_barras_punto_y_coma_y_saltos():
    texto = format_calendar(
        [evento(title="A;B,C\\D", description="linea\notra")], DTSTAMP
    )
    assert "SUMMARY:A\\;B\\,C\\\\D" in texto
    assert "DESCRIPTION:linea\\notra" in texto


def test_el_uid_es_estable_por_tarea():
    texto = format_calendar([evento(uid="task-12@coreplanner")], DTSTAMP)
    assert "UID:task-12@coreplanner" in texto


def test_el_asignado_va_como_attendee_y_el_responsable_como_organizer():
    texto = format_calendar(
        [
            evento(
                attendees=[IcalPerson(name="Ana; la ingeniera", email="ana@example.com")],
                organizer=IcalPerson(name="Jorge", email="jorge@example.com"),
            )
        ],
        DTSTAMP,
    )
    assert "ATTENDEE;CN=Ana\\; la ingeniera:mailto:ana@example.com" in texto
    assert "ORGANIZER;CN=Jorge:mailto:jorge@example.com" in texto


def test_el_url_sal_si_viene():
    texto = format_calendar([evento(url="https://coreplanner.local/projects/12")], DTSTAMP)
    assert "URL:https://coreplanner.local/projects/12" in texto


def test_el_calendario_vacio_solo_lleva_cabecera():
    texto = format_calendar([], DTSTAMP)
    lineas = texto.split("\r\n")
    assert "BEGIN:VEVENT" not in lineas
    assert lineas[-2] == "END:VCALENDAR"


def test_el_texto_termina_en_crlf_y_no_lleva_saltos_sueltos():
    texto = format_calendar([evento()], DTSTAMP)
    assert texto.endswith("\r\n")
    # Sin CRLF no quedan retornos de carro sueltos.
    assert texto.replace("\r\n", "") == texto.replace("\r\n", "").replace("\r", "")


def test_el_plegado_cuenta_octets_y_no_caracteres():
    # 80 caracteres ASCII: el SUMMARY pesa 88 octets y plega a 75 + 13.
    ascii_block = summary_lines(format_calendar([evento(title="A" * 80)], DTSTAMP))
    assert len(ascii_block) == 2
    assert len(ascii_block[0].encode("utf-8")) == 75
    assert ascii_block[1].encode("utf-8") == b" " + b"A" * 13

    # 60 acentos (2 octets c/u): el SUMMARY pesa 128 octets y plega a 74 +
    # 55 (la continuada lleva el espacio inicial, que cuenta). Pesa casi el
    # doble que el mismo numero de caracteres ASCII: los octets mandan, no
    # los caracteres.
    acentos_block = summary_lines(format_calendar([evento(title="Á" * 60)], DTSTAMP))
    assert len(acentos_block) == 2
    assert len(acentos_block[0].encode("utf-8")) == 74
    assert len(acentos_block[1].encode("utf-8")) == 55

    # El emoji pesa 4 octets: 19 emojis son 84 de contenido (SUMMARY + 76)
    # y plegan a 72 + 13 (la continuada lleva el espacio inicial).
    emoji_block = summary_lines(format_calendar([evento(title="🦄" * 19)], DTSTAMP))
    assert len(emoji_block) == 2
    assert len(emoji_block[0].encode("utf-8")) == 72
    assert len(emoji_block[1].encode("utf-8")) == 13


def test_el_plegado_no_parte_un_caracter_multibyte():
    # 75 acentos son 150 octets: plegados a 74 + 75 + 11 (la continuada lleva
    # espacio, que cuenta en los 75).
    bloque = summary_lines(format_calendar([evento(title="Á" * 75)], DTSTAMP))
    pesos = [len(linea.encode("utf-8")) for linea in bloque]
    assert pesos == [74, 75, 11]
    # Ningun caracter multibyte queda partido: cada linea termina y empieza
    # en un caracter completo.
    for linea in bloque:
        linea.encode("utf-8").decode("utf-8")
