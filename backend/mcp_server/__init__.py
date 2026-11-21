"""Servidor MCP de CorePlanner.

Expone la API a clientes MCP como herramientas de solo lectura. El servidor
es un cliente HTTP de la propia API: no toca la base de datos y el agente
hereda la autorizacion por proyecto y la visibilidad del token que lleva.
"""
