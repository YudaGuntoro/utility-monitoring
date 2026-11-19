FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["Worker/Worker.csproj", "Worker/"]
COPY ["Web.API.Domain/Web.API.Domain.csproj", "Web.API.Domain/"]
COPY ["Web.API.Persistence/Web.API.Persistence.csproj", "Web.API.Persistence/"]
RUN dotnet restore "Worker/Worker.csproj"

COPY . .
RUN dotnet publish "Worker/Worker.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/runtime:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Worker.dll"]
