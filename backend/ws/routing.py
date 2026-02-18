"""
WebSocket URL routing for Django Channels.

Defines the URL patterns that map WebSocket paths to their consumers.
"""

from django.urls import re_path

from ws.agent_status import AgentStatusConsumer
from ws.chat import ChatConsumer
from ws.neural_data import NeuralDataConsumer

websocket_urlpatterns = [
    re_path(r"ws/neural-data/$", NeuralDataConsumer.as_asgi()),
    re_path(r"ws/agent-status/$", AgentStatusConsumer.as_asgi()),
    re_path(r"ws/chat/$", ChatConsumer.as_asgi()),
]
