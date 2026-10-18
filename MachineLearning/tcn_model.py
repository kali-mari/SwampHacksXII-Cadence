import torch
from torch import nn


class CausalResidualBlock(nn.Module):
    def __init__(self, channels, dilation, kernel_size=3, dropout=0.1):
        super().__init__()
        padding = (kernel_size - 1) * dilation
        self.padding = padding
        self.layers = nn.Sequential(
            nn.Conv1d(channels, channels, kernel_size, padding=padding, dilation=dilation),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Conv1d(channels, channels, kernel_size, padding=padding, dilation=dilation),
            nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.activation = nn.ReLU()

    def forward(self, values):
        output = self.layers[0](values)
        if self.padding:
            output = output[..., :-self.padding]
        output = self.layers[1](output)
        output = self.layers[2](output)
        output = self.layers[3](output)
        if self.padding:
            output = output[..., :-self.padding]
        output = self.layers[4](output)
        output = self.layers[5](output)
        return self.activation(output + values)


class PostureTCN(nn.Module):
    def __init__(self, input_channels, hidden_channels=32, dropout=0.1):
        super().__init__()
        self.input_projection = nn.Conv1d(input_channels, hidden_channels, kernel_size=1)
        self.blocks = nn.Sequential(
            CausalResidualBlock(hidden_channels, dilation=1, dropout=dropout),
            CausalResidualBlock(hidden_channels, dilation=2, dropout=dropout),
            CausalResidualBlock(hidden_channels, dilation=4, dropout=dropout),
            CausalResidualBlock(hidden_channels, dilation=8, dropout=dropout),
        )
        self.classifier = nn.Linear(hidden_channels, 1)

    def forward(self, values):
        features = self.blocks(self.input_projection(values))
        return self.classifier(features[:, :, -1]).squeeze(1)
