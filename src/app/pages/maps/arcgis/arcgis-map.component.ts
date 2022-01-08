import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { setDefaultOptions, loadModules } from 'esri-loader';
import { Subscription } from "rxjs";
import { ITestItem } from "../../../@core/database/firebase";
import { FirebaseMockService } from "../../../@core/database/firebase-mock";
// import { FirebaseService } from "../../../@core/database/firebase";

@Component({
    selector: "app-esri-map",
    templateUrl: "./arcgis-map.component.html",
    styleUrls: ["./arcgis-map.component.scss"]
})
export class ArcGISMapComponent implements OnInit, OnDestroy {
    // The <div> where we will place the map
    @ViewChild("mapViewNode", { static: true }) private mapViewEl: ElementRef;
    view: __esri.MapView;
    timeoutHandler = null;

    _Map;
    _MapView;
    _FeatureLayer;
    _Graphic;
    _GraphicsLayer;
    _Route;
    _RouteParameters;
    _FeatureSet;
    _Point;

    map: __esri.Map;
    pointGraphic: __esri.Graphic;
    graphicsLayer: __esri.GraphicsLayer;

    pointCoords: number[] = [-118.73682450024377, 34.07817583063242];
    dir: number = 0;
    count: number = 0;

    subscriptionList: Subscription;
    subscriptionObj: Subscription;

    isConnected: boolean = false;

    constructor(
        // private fbs: FirebaseService
        private fbs: FirebaseMockService
    ) { }

    connectFirebase() {
        if (this.isConnected) {
            return;
        }
        this.isConnected = true;
        this.fbs.connectToDatabase();
        this.subscriptionList = this.fbs.getChangeFeedList().subscribe((items: ITestItem[]) => {
            console.log("got new items from list: ", items);
        });
        this.subscriptionObj = this.fbs.getChangeFeedObj().subscribe((stat: ITestItem[]) => {
            console.log("item updated from object: ", stat);
        });
    }

    addTestItem() {
        this.fbs.addTestItem();
    }

    disconnectFirebase() {
        if (this.subscriptionList != null) {
            this.subscriptionList.unsubscribe();
        }
        if (this.subscriptionObj != null) {
            this.subscriptionObj.unsubscribe();
        }
    }

    async initializeMap() {
        try {

            // before loading the modules for the first time,
            // also lazy load the CSS for the version of
            // the script that you're loading from the CDN
            setDefaultOptions({ css: true });

            // Load the modules for the ArcGIS API for JavaScript
            const [esriConfig, Map, MapView, FeatureLayer, Graphic, Point, GraphicsLayer, route, RouteParameters, FeatureSet] = await loadModules([
                "esri/config",
                "esri/Map",
                "esri/views/MapView",
                "esri/layers/FeatureLayer",
                "esri/Graphic",
                "esri/geometry/Point",
                "esri/layers/GraphicsLayer",
                "esri/rest/route",
                "esri/rest/support/RouteParameters",
                "esri/rest/support/FeatureSet"
            ]);

            // esriConfig.apiKey = "MY_API_KEY";

            this._Map = Map;
            this._MapView = MapView;
            this._FeatureLayer = FeatureLayer;
            this._Graphic = Graphic;
            this._GraphicsLayer = GraphicsLayer;
            this._Route = route;
            this._RouteParameters = RouteParameters;
            this._FeatureSet = FeatureSet;
            this._Point = Point;

            // Configure the Map
            const mapProperties = {
                basemap: "streets-vector"
            };

            this.map = new Map(mapProperties);

            this.addFeatureLayers();
            this.addPoint(this.pointCoords[1], this.pointCoords[0]);

            // Initialize the MapView
            const mapViewProperties = {
                container: this.mapViewEl.nativeElement,
                center: [-118.73682450024377, 34.07817583063242],
                zoom: 10,
                map: this.map
            };

            this.view = new MapView(mapViewProperties);

            // Fires `pointer-move` event when user clicks on "Shift"
            // key and moves the pointer on the view.
            this.view.on('pointer-move', ["Shift"], (event) => {
                let point = this.view.toMap({ x: event.x, y: event.y });
                console.log("map moved: ", point.longitude, point.latitude);
            });

            await this.view.when(); // wait for map to load
            console.log("ArcGIS map loaded");

            // this.addRouter();

            return this.view;
        } catch (error) {
            console.error("EsriLoader: ", error);
            throw error;
        }
    }

    addRouter() {
        const routeUrl = "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";
       
        this.view.on("click", (event) => {
            console.log("point clicked: ", event.mapPoint.latitude, event.mapPoint.longitude);
            if (this.view.graphics.length === 0) {
                addGraphic("origin", event.mapPoint);
            } else if (this.view.graphics.length === 1) {
                addGraphic("destination", event.mapPoint);
                getRoute(); // Call the route service
            } else {
                this.view.graphics.removeAll();
                addGraphic("origin", event.mapPoint);
            }
        });

        var addGraphic = (type: any, point: any) => {
            const graphic = new this._Graphic({
                symbol: {
                    type: "simple-marker",
                    color: (type === "origin") ? "white" : "black",
                    size: "8px"
                } as any,
                geometry: point
            });
            this.view.graphics.add(graphic);
        }

        var getRoute = () => {
            const routeParams = new this._RouteParameters({
                stops: new this._FeatureSet({
                    features: this.view.graphics.toArray()
                }),
                returnDirections: true
            });

            this._Route.solve(routeUrl, routeParams).then((data: any) => {
                for (let result of data.routeResults) {
                    result.route.symbol = {
                        type: "simple-line",
                        color: [5, 150, 255],
                        width: 3
                    };
                    this.view.graphics.add(result.route);
                }

                // Display directions
                if (data.routeResults.length > 0) {
                    const directions: any = document.createElement("ol");
                    directions.classList = "esri-widget esri-widget--panel esri-directions__scroller";
                    directions.style.marginTop = "0";
                    directions.style.padding = "15px 15px 15px 30px";
                    const features = data.routeResults[0].directions.features;

                    let sum = 0;
                    // Show each direction
                    features.forEach((result: any, i: any) => {
                        sum += parseFloat(result.attributes.length);
                        const direction = document.createElement("li");
                        direction.innerHTML = result.attributes.text + " (" + result.attributes.length + " miles)";
                        directions.appendChild(direction);
                    });

                    sum = sum * 1.609344;
                    console.log('dist (km) = ', sum);

                    this.view.ui.empty("top-right");
                    this.view.ui.add(directions, "top-right");

                }
               
            }).catch((error: any) => {
                console.log(error);
            });
        }
    }

    addFeatureLayers() {
        // Trailheads feature layer (points)
        var trailheadsLayer: __esri.FeatureLayer = new this._FeatureLayer({
            url:
                "https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trailheads/FeatureServer/0"
        });

        this.map.add(trailheadsLayer);


        // Trails feature layer (lines)
        var trailsLayer: __esri.FeatureLayer = new this._FeatureLayer({
            url:
                "https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trails/FeatureServer/0"
        });

        this.map.add(trailsLayer, 0);

        // Parks and open spaces (polygons)
        var parksLayer: __esri.FeatureLayer = new this._FeatureLayer({
            url:
                "https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Parks_and_Open_Space/FeatureServer/0"
        });

        this.map.add(parksLayer, 0);

        console.log("feature layers added");
    }

    addPoint(lat: number, lng: number) {
        this.graphicsLayer = new this._GraphicsLayer();
        this.map.add(this.graphicsLayer);
        const point = { //Create a point
            type: "point",
            longitude: lng,
            latitude: lat
        };
        const simpleMarkerSymbol = {
            type: "simple-marker",
            color: [226, 119, 40],  // Orange
            outline: {
                color: [255, 255, 255], // White
                width: 1
            }
        };
        this.pointGraphic = new this._Graphic({
            geometry: point,
            symbol: simpleMarkerSymbol
        });
        this.graphicsLayer.add(this.pointGraphic);
    }

    removePoint() {
        if (this.pointGraphic != null) {
            this.graphicsLayer.remove(this.pointGraphic);
        }
    }

    runTimer() {
        this.timeoutHandler = setTimeout(() => {
            // code to execute continuously until the view is closed
            // ...
            this.animatePointDemo();
            this.runTimer();
        }, 200);
    }

    animatePointDemo() {
        this.removePoint();
        switch (this.dir) {
            case 0:
                this.pointCoords[1] += 0.01;
                break;
            case 1:
                this.pointCoords[0] += 0.02;
                break;
            case 2:
                this.pointCoords[1] -= 0.01;
                break;
            case 3:
                this.pointCoords[0] -= 0.02;
                break;
        }

        this.count += 1;
        if (this.count >= 10) {
            this.count = 0;
            this.dir += 1;
            if (this.dir > 3) {
                this.dir = 0;
            }
        }

        this.addPoint(this.pointCoords[1], this.pointCoords[0]);
    }

    stopTimer() {
        if (this.timeoutHandler != null) {
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }

    }

    ngOnInit() {
        this.initializeMap().then(() => {
            this.runTimer();
        }).catch((err) => {
            console.error(err);
            alert("An error occured while loading the map");
        })
    }

    ngOnDestroy() {
        if (this.view) {
            // destroy the map view
            this.view.container = null;
        }
        this.stopTimer();
        this.disconnectFirebase();
    }
}