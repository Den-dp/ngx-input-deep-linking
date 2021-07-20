import {
  Component,
  ComponentFactoryResolver,
  ComponentRef,
  OnDestroy,
  OnInit,
  Type,
  ViewContainerRef,
} from '@angular/core';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {DeepLinkingWrapperConfig} from './deep-linking-wrapper-config.model';
import {untilDestroyed} from 'ngx-take-until-destroy';
import {EMPTY, Observable} from 'rxjs';
import {switchMap} from 'rxjs/operators';
import {replaceUrlPathParam, splitUrlAndQueryParams} from './url-helper';

@Component({
  templateUrl: './deep-linking-wrapper.component.html',
})
export class DeepLinkingWrapperComponent implements OnInit, OnDestroy {
  private config!: DeepLinkingWrapperConfig;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly componentFactoryResolver: ComponentFactoryResolver,
    private readonly viewContainerRef: ViewContainerRef
  ) {
  }

  ngOnInit(): void {
    this.config = this.readConfig();

    const componentRef = this.resolveAndRenderComponent(this.config.component);

    this.populateAndSyncComponentInputsWithPathParams(
      componentRef.instance,
      this.config.params
    );
    this.populateAndSyncComponentInputsWithQueryParams(
      componentRef.instance,
      this.config.queryParams
    );

    this.subscribeToComponentOutputsToSyncPathParams(
      componentRef.instance,
      this.config.params
    );
    this.subscribeToComponentOutputsToSyncQueryParams(
      componentRef.instance,
      this.config.queryParams
    );
  }

  ngOnDestroy(): void {
  }

  private readConfig(): DeepLinkingWrapperConfig {
    const config: DeepLinkingWrapperConfig = this.activatedRoute.snapshot.data.ngxDeepLinkingConfig;
    if (!config || !config.component) {
      throw Error(
        'Configuration for ngx-deep-linking is missing in route definition'
      );
    }
    return config;
  }

  private resolveAndRenderComponent(component: Type<any>): ComponentRef<any> {
    const componentFactory =
      this.componentFactoryResolver.resolveComponentFactory(component);
    this.viewContainerRef.clear();
    return this.viewContainerRef.createComponent(componentFactory);
  }

  private populateAndSyncComponentInputsWithPathParams(
    componentInstance: any,
    params: string[]
  ): void {
    this.populateInputsFromParams(
      componentInstance,
      params,
      this.activatedRoute.snapshot.params
    );
    this.activatedRoute.params
      .pipe(untilDestroyed(this))
      .subscribe((changedParams) => {
        this.populateInputsFromParams(componentInstance, params, changedParams);
      });
  }

  private populateAndSyncComponentInputsWithQueryParams(
    componentInstance: any,
    params: string[]
  ): void {
    this.populateInputsFromParams(
      componentInstance,
      params,
      this.activatedRoute.snapshot.queryParams
    );
    this.activatedRoute.queryParams
      .pipe(untilDestroyed(this))
      .subscribe((changedParams) => {
        this.populateInputsFromParams(componentInstance, params, changedParams);
      });
  }

  private populateInputsFromParams(
    componentInstance: any,
    inputNames: string[],
    params: Params
  ) {
    for (let inputName of inputNames) {
      if (
        this.paramToString(componentInstance[inputName]) !== params[inputName]
      ) {
        componentInstance[inputName] = params[inputName];
      }
    }
  }

  private subscribeToComponentOutputsToSyncPathParams(
    instance: any,
    pathParams: string[]
  ) {
    pathParams.forEach((pathParamName) => {
      const outputName = `${pathParamName}Change`;
      const output: Observable<unknown> = instance[outputName];

      if (!!output) {
        output
          .pipe(
            untilDestroyed(this),
            switchMap((newValue) => {
              const routeConfig = this.activatedRoute.routeConfig;
              if (!routeConfig || !routeConfig.path) {
                return EMPTY;
              }

              const {urlWithoutParams, urlQueryParams} =
                splitUrlAndQueryParams(this.router.url);
              const pathDefinition = this.router.config
                .map((routeConfig) => routeConfig.path!)
                .filter((paths) => !!paths)
                .join('/');

              const newUrl = replaceUrlPathParam(
                urlWithoutParams,
                pathDefinition,
                pathParamName,
                this.paramToString(newValue)
              );
              return this.router.navigateByUrl(newUrl + '?' + urlQueryParams);
            })
          )
          .subscribe();
      }
    });
  }

  private subscribeToComponentOutputsToSyncQueryParams(
    instance: any,
    queryParams: string[]
  ) {
    queryParams.forEach((queryParamName) => {
      const outputName = `${queryParamName}Change`;
      const output: Observable<unknown> = instance[outputName];

      if (!!output) {
        output
          .pipe(
            untilDestroyed(this),
            switchMap((newValue) => {
              const {urlWithoutParams, urlQueryParams} =
                splitUrlAndQueryParams(this.router.url);
              if (!!newValue) {
                urlQueryParams.set(
                  queryParamName,
                  this.paramToString(newValue)
                );
              } else {
                urlQueryParams.delete(queryParamName);
              }

              return this.router.navigateByUrl(
                `${urlWithoutParams}?${urlQueryParams}`
              );
            })
          )
          .subscribe();
      }
    });
  }

  private paramToString(newValue: unknown) {
    return newValue === undefined || newValue === null ? '' : String(newValue);
  }
}
