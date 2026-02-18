"""
Hardware Control Agent.

Interfaces with physical or simulated hardware (GPIO, serial, SCPI, etc.)
to send commands and read status.
"""

import os
from typing import Any, Dict, List

from agents.base_agent import BaseAgent


class HardwareControlAgent(BaseAgent):
    """Agent that manages hardware interactions."""

    def __init__(self):
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "hardware_control"),
            agent_port=int(os.getenv("AGENT_PORT", "8090")),
            agent_type="hardware_control",
        )
        self._register_routes()

    def _register_routes(self) -> None:
        @self.app.post("/command")
        async def send_command(payload: Dict[str, Any] = {}):
            """Send a command to a hardware device."""
            return {"status": "command_sent", "agent": self.agent_name}

    # ------------------------------------------------------------------
    # MCP tools
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "hardware_control.configure_bias",
                "description": "Configure bias voltages for the neural interface ASIC.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "bias_name": {"type": "string", "description": "Bias node identifier"},
                        "value_uA": {"type": "number", "description": "Bias current in microamps"},
                    },
                    "required": ["bias_name", "value_uA"],
                },
            },
            {
                "name": "hardware_control.configure_pixels",
                "description": "Configure pixel array settings on the neural probe.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "pixel_mask": {"type": "integer", "description": "Bitmask of active pixels"},
                        "gain": {"type": "string", "enum": ["low", "medium", "high"], "description": "Pixel amplifier gain"},
                    },
                    "required": ["pixel_mask"],
                },
            },
            {
                "name": "hardware_control.set_stimulation",
                "description": "Configure electrical stimulation parameters for a channel.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel": {"type": "integer", "description": "Stimulation channel index"},
                        "amplitude_uA": {"type": "number", "description": "Stimulation amplitude in microamps"},
                        "pulse_width_us": {"type": "number", "description": "Pulse width in microseconds"},
                        "frequency_hz": {"type": "number", "description": "Stimulation frequency in Hz"},
                    },
                    "required": ["channel", "amplitude_uA", "pulse_width_us"],
                },
            },
            {
                "name": "hardware_control.set_clocks",
                "description": "Set clock frequencies for the ASIC and FPGA subsystems.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "master_clock_mhz": {"type": "number", "description": "Master clock in MHz"},
                        "adc_clock_mhz": {"type": "number", "description": "ADC sampling clock in MHz"},
                    },
                    "required": ["master_clock_mhz"],
                },
            },
            {
                "name": "hardware_control.set_gain_mode",
                "description": "Set the gain mode of the analog front-end amplifiers.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "mode": {"type": "string", "enum": ["low_noise", "high_gain", "wide_band"], "description": "Amplifier gain mode"},
                        "channels": {"type": "array", "items": {"type": "integer"}, "description": "Channels to apply the gain mode to"},
                    },
                    "required": ["mode"],
                },
            },
            {
                "name": "hardware_control.configure_tia",
                "description": "Configure the transimpedance amplifier for impedance measurement.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "feedback_resistance_ohm": {"type": "number", "description": "TIA feedback resistance in ohms"},
                        "bandwidth_hz": {"type": "number", "description": "TIA bandwidth in Hz"},
                    },
                    "required": ["feedback_resistance_ohm"],
                },
            },
            {
                "name": "hardware_control.upload_waveform",
                "description": "Upload a custom stimulation waveform to the device memory.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "waveform_id": {"type": "string", "description": "Identifier for the uploaded waveform"},
                        "samples": {"type": "array", "items": {"type": "number"}, "description": "Waveform sample values"},
                        "sample_rate_hz": {"type": "number", "description": "Sample rate of the waveform"},
                    },
                    "required": ["waveform_id", "samples", "sample_rate_hz"],
                },
            },
            {
                "name": "hardware_control.trigger_stimulation",
                "description": "Trigger the stimulation output on configured channels.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "channel": {"type": "integer", "description": "Stimulation channel to trigger"},
                        "waveform_id": {"type": "string", "description": "Waveform to use, or null for default pulse"},
                        "repeat_count": {"type": "integer", "description": "Number of repetitions", "default": 1},
                    },
                    "required": ["channel"],
                },
            },
            {
                "name": "hardware_control.get_device_info",
                "description": "Retrieve hardware device information including ASIC revision, FPGA firmware version, and serial number.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                },
            },
        ]


def main() -> None:
    agent = HardwareControlAgent()
    agent.run()


if __name__ == "__main__":
    main()
