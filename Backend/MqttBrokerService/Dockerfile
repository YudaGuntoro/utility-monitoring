FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["MqttBrokerService/MqttBrokerService.csproj", "MqttBrokerService/"]
RUN dotnet restore "MqttBrokerService/MqttBrokerService.csproj"

COPY . .
RUN dotnet publish "MqttBrokerService/MqttBrokerService.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/runtime:8.0 AS final
WORKDIR /app
EXPOSE 1883
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "MqttBrokerService.dll"]
